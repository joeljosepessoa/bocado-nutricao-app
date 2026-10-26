import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../src/legal/legal-documents';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

describe('Aceite de Termos de Uso e Política de Privacidade (e2e)', () => {
  let app: INestApplication;
  const previousFlag = process.env.LEGAL_CONSENT_ENFORCED;

  beforeAll(async () => {
    process.env.LEGAL_CONSENT_ENFORCED = 'true';
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (previousFlag === undefined) delete process.env.LEGAL_CONSENT_ENFORCED;
    else process.env.LEGAL_CONSENT_ENFORCED = previousFlag;
    await app.close();
    await prisma.$disconnect();
  });

  const accept = (token: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/client/legal/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({
        acceptTerms: true,
        acceptPrivacy: true,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        source: 'mobile_app_first_open',
        appVersion: '1.3.0',
        platform: 'android',
        ...body,
      });

  async function newPatient() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    return { professional, client, password: temporaryPassword, session, token: session.accessToken as string };
  }

  it('documentos vigentes são públicos (o app mostra antes do login)', async () => {
    const res = await request(app.getHttpServer()).get('/legal/documents').expect(200);
    expect(res.body.termsVersion).toBe('1.0');
    expect(res.body.privacyVersion).toBe('1.0');
    expect(res.body.documents.map((d: { kind: string }) => d.kind)).toEqual(['terms', 'privacy']);
    const terms = res.body.documents[0];
    expect(JSON.stringify(terms)).toContain('acompanhamento nutricional');
    expect(JSON.stringify(terms)).toContain('fotos de evolução');
    // Nada de destacar "inteligência artificial" nos textos.
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/intelig[eê]ncia artificial|\bia\b|gerado por/);
  });

  it('1) paciente novo: login avisa que precisa aceitar e o servidor bloqueia o resto do app', async () => {
    const { session, token } = await newPatient();
    expect(session.user.termsAcceptanceRequired).toBe(true);

    const blocked = await request(app.getHttpServer()).get('/client/diet').set('Authorization', `Bearer ${token}`).expect(403);
    expect(blocked.body.code).toBe('TERMS_REQUIRED');
    await request(app.getHttpServer()).get('/client/me').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/notifications/preferences').set('Authorization', `Bearer ${token}`).expect(403);

    const status = await request(app.getHttpServer()).get('/client/legal/status').set('Authorization', `Bearer ${token}`).expect(200);
    expect(status.body).toMatchObject({ acceptanceRequired: true, accepted: null, currentTermsVersion: '1.0', currentPrivacyVersion: '1.0' });
  });

  it('2) antes do aceite continuam liberados: trocar senha, exportar dados e excluir conta (LGPD)', async () => {
    const { token, password } = await newPatient();
    await request(app.getHttpServer()).post('/client/data-export').set('Authorization', `Bearer ${token}`).expect(201);
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NovaSenha#2026' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/client/account-deletion')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'NovaSenha#2026' })
      .expect(204);
  });

  it('3) não aceita só uma das caixas, nem versão desatualizada', async () => {
    const { token, client } = await newPatient();
    await accept(token, { acceptPrivacy: false }).expect(400);
    await accept(token, { acceptTerms: false }).expect(400);
    const outdated = await accept(token, { termsVersion: '0.9' }).expect(400);
    expect(outdated.body.code).toBe('LEGAL_VERSION_OUTDATED');
    await accept(token, { acceptTerms: undefined }).expect(400);
    expect(await prisma.legalConsent.count({ where: { userId: client.user.id } })).toBe(0);
  });

  it('4) aceite válido grava versão, data, origem e libera o app', async () => {
    const { token, client } = await newPatient();
    const before = Date.now();
    const res = await accept(token).expect(200);
    expect(res.body.acceptanceRequired).toBe(false);
    expect(res.body.accepted).toMatchObject({ termsVersion: '1.0', privacyVersion: '1.0' });

    const rows = await prisma.legalConsent.findMany({ where: { userId: client.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      termsVersion: '1.0',
      privacyVersion: '1.0',
      status: 'accepted',
      source: 'mobile_app_first_open',
      appVersion: '1.3.0',
      platform: 'android',
    });
    expect(rows[0].acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(user.privacyAcceptedAt).not.toBeNull();

    await request(app.getHttpServer()).get('/client/diet').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('5) aceite não expira: novo login e refresh não pedem de novo; aceitar de novo não duplica', async () => {
    const { token, client, password, session } = await newPatient();
    await accept(token).expect(200);
    await accept(token).expect(200);
    expect(await prisma.legalConsent.count({ where: { userId: client.user.id } })).toBe(1);

    const again = await login(app, client.user.email, password);
    expect(again.user.termsAcceptanceRequired).toBe(false);
    const refreshed = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
    expect(refreshed.body.user.termsAcceptanceRequired).toBe(false);
    const me = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.termsAcceptanceRequired).toBe(false);
  });

  it('6) quem já usava o app (aceite antigo) precisa aceitar a versão 1.0 uma vez — o antigo fica no histórico', async () => {
    const { token, client, password } = await newPatient();
    // Situação de quem aceitou na tela antiga: campo antigo + linha "legado" (como a migration cria).
    await request(app.getHttpServer()).post('/client/accept-privacy-terms').set('Authorization', `Bearer ${token}`).expect(204);
    const old = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    await prisma.legalConsent.create({
      data: { userId: client.user.id, termsVersion: '0', privacyVersion: '0', status: 'legacy', acceptedAt: old.privacyAcceptedAt!, source: 'legacy_privacy_screen' },
    });

    const session = await login(app, client.user.email, password);
    expect(session.user.privacyAcceptedAt).not.toBeNull();
    expect(session.user.termsAcceptanceRequired).toBe(true);
    await request(app.getHttpServer()).get('/client/workout').set('Authorization', `Bearer ${token}`).expect(403);

    await accept(token, { source: 'mobile_app' }).expect(200);
    const rows = await prisma.legalConsent.findMany({ where: { userId: client.user.id }, orderBy: { acceptedAt: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['legacy', 'accepted']);
    // O campo antigo não é sobrescrito.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(after.privacyAcceptedAt?.getTime()).toBe(old.privacyAcceptedAt?.getTime());
    await request(app.getHttpServer()).get('/client/workout').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('7) profissional nunca é bloqueado nem precisa aceitar', async () => {
    const professional = await registerProfessional(app);
    expect(professional.user.termsAcceptanceRequired).toBe(false);
    await request(app.getHttpServer()).get('/clients').set('Authorization', `Bearer ${professional.accessToken}`).expect(200);
    await request(app.getHttpServer()).post('/client/legal/accept').set('Authorization', `Bearer ${professional.accessToken}`).send({}).expect(403);
  });

  it('8) sem login não dá para aceitar', async () => {
    await request(app.getHttpServer()).post('/client/legal/accept').send({ acceptTerms: true, acceptPrivacy: true, termsVersion: '1.0', privacyVersion: '1.0' }).expect(401);
    await request(app.getHttpServer()).get('/client/legal/status').expect(401);
  });

  it('9) exportação de dados traz o histórico de aceites', async () => {
    const { token } = await newPatient();
    await accept(token).expect(200);
    const res = await request(app.getHttpServer()).post('/client/data-export').set('Authorization', `Bearer ${token}`).expect(201);
    expect(res.body.legalConsents).toEqual([
      expect.objectContaining({ termsVersion: '1.0', privacyVersion: '1.0', status: 'accepted', source: 'mobile_app_first_open' }),
    ]);
  });
});
