import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { validBirthDate } from '../src/signup-link/signup-link.service';
import { createClient, login, registerProfessional, uniqueEmail } from './helpers';

const prisma = new PrismaClient();

describe('Link de cadastro do paciente (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const form = (email: string, extra: Record<string, unknown> = {}) => ({
    fullName: '  Paciente   do Link ',
    email,
    password: 'MinhaSenha123',
    birthDate: '1990-05-17',
    phone: '(11) 99999-0000',
    gender: 'feminino',
    acceptTerms: true,
    acceptPrivacy: true,
    termsVersion: '1.0',
    privacyVersion: '1.0',
    ...extra,
  });

  it('liga o link, o paciente se cadastra sozinho, entra no app sem trocar senha e já com os termos aceitos', async () => {
    const me = await registerProfessional(app, { fullName: 'Nutri do Link' });
    const server = app.getHttpServer();

    expect((await request(server).get('/professionals/me/signup-link').set(as(me.accessToken)).expect(200)).body).toEqual({ code: null });
    const { code } = (await request(server).post('/professionals/me/signup-link').set(as(me.accessToken)).expect(200)).body;
    expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);

    // Página pública: sem login.
    expect((await request(server).get(`/public/signup/${code}`).expect(200)).body).toEqual({ professionalName: 'Nutri do Link' });

    const email = uniqueEmail('Link.Paciente');
    const done = (await request(server).post(`/public/signup/${code}`).send(form(email)).expect(201)).body;
    expect(done).toEqual({ email: email.toLowerCase(), professionalName: 'Nutri do Link' });

    // Aparece na lista do profissional, marcado como cadastrado pelo link.
    const list = (await request(server).get('/clients').set(as(me.accessToken)).expect(200)).body;
    expect(list.items).toEqual([expect.objectContaining({ selfRegisteredAt: expect.any(String), user: { email: email.toLowerCase(), fullName: 'Paciente do Link' } })]);
    const detail = (await request(server).get(`/clients/${list.items[0].id}`).set(as(me.accessToken)).expect(200)).body;
    expect(detail).toMatchObject({ phone: '(11) 99999-0000', gender: 'feminino', birthDate: '1990-05-17T00:00:00.000Z' });

    // Entra no app com a senha que escolheu; não precisa trocar e os termos já estão aceitos.
    const session = await login(app, email.toLowerCase(), 'MinhaSenha123');
    expect(session.user.mustChangePassword).toBe(false);
    const legal = (await request(server).get('/client/legal/status').set(as(session.accessToken)).expect(200)).body;
    expect(legal.acceptanceRequired).toBe(false);
    const consent = await prisma.legalConsent.findFirst({ where: { userId: list.items[0].id } });
    expect(consent?.source).toBe('signup_link');

    // Avisos do painel: novo cadastro pelo link.
    const alerts = (await request(server).get('/professionals/me/alerts').set(as(me.accessToken)).expect(200)).body;
    expect(alerts.newSignups).toEqual([expect.objectContaining({ clientId: list.items[0].id, name: 'Paciente do Link', days: 0 })]);

    // Mesmo e-mail (com outra caixa) não cadastra de novo.
    const again = await request(server).post(`/public/signup/${code}`).send(form(email.toUpperCase())).expect(400);
    expect(again.body.message).toContain('Não foi possível fazer o cadastro com este e-mail');
  });

  it('gerar link novo ou desligar invalida o anterior; código estranho dá 404', async () => {
    const me = await registerProfessional(app);
    const server = app.getHttpServer();
    const first = (await request(server).post('/professionals/me/signup-link').set(as(me.accessToken)).expect(200)).body.code;
    const second = (await request(server).post('/professionals/me/signup-link').set(as(me.accessToken)).expect(200)).body.code;
    expect(second).not.toBe(first);

    const gone = await request(server).get(`/public/signup/${first}`).expect(404);
    expect(gone.body.message).toContain('Peça um link novo');
    await request(server).post(`/public/signup/${first}`).send(form(uniqueEmail('velho'))).expect(404);
    await request(server).get(`/public/signup/${second}`).expect(200);

    await request(server).delete('/professionals/me/signup-link').set(as(me.accessToken)).expect(200);
    await request(server).get(`/public/signup/${second}`).expect(404);
    await request(server).get('/public/signup/%27%20or%201%3D1').expect(404);
  });

  it('confere senha, termos, data e e-mail já usado por paciente do painel', async () => {
    const me = await registerProfessional(app);
    const server = app.getHttpServer();
    const { code } = (await request(server).post('/professionals/me/signup-link').set(as(me.accessToken)).expect(200)).body;
    const taken = (await createClient(app, me.accessToken)).client.user.email;

    const weak = await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('fraca'), { password: 'curta1' })).expect(400);
    expect(JSON.stringify(weak.body.message)).toContain('pelo menos 10 caracteres');
    await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('termos'), { acceptPrivacy: false })).expect(400);
    const old = await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('versao'), { termsVersion: '0.9' })).expect(400);
    expect(old.body.code).toBe('LEGAL_VERSION_OUTDATED');
    await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('futuro'), { birthDate: '2999-01-01' })).expect(400);
    await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('sexo'), { gender: 'x' })).expect(400);
    // Campo que não existe no formulário (ex.: tentar escolher outro profissional) é recusado.
    await request(server).post(`/public/signup/${code}`).send(form(uniqueEmail('extra'), { professionalId: 'outro' })).expect(400);
    await request(server).post(`/public/signup/${code}`).send(form(taken)).expect(400);

    // Só o profissional mexe no próprio link.
    const { temporaryPassword, client } = await createClient(app, me.accessToken);
    const patient = await login(app, client.user.email, temporaryPassword);
    await request(server).post('/professionals/me/signup-link').set(as(patient.accessToken)).expect(403);
    await request(server).get('/professionals/me/signup-link').expect(401);
  });

  it('data de nascimento plausível', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(validBirthDate('1990-05-17', now)).toBe(true);
    expect(validBirthDate('2026-10-29', now)).toBe(true);
    expect(validBirthDate('2026-10-30', now)).toBe(false);
    expect(validBirthDate('1899-12-31', now)).toBe(false);
  });
});
