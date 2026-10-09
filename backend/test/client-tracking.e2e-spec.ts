import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// PNG 1x1 válido — o upload só confere tipo e tamanho.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Registros do paciente: metas, peso, água e fotos (e2e)', () => {
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

  async function setup() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    return {
      professionalAuth: { Authorization: `Bearer ${professional.accessToken}` },
      clientId: client.id,
      auth: { Authorization: `Bearer ${session.accessToken}` },
    };
  }

  it('nutricionista define meta de peso e de água na ficha; paciente lê em /client/me', async () => {
    const { professionalAuth, clientId, auth } = await setup();

    const before = await request(app.getHttpServer()).get('/client/me').set(auth).expect(200);
    expect(before.body.targetWeightKg).toBeNull();
    expect(before.body.waterGoalMl).toBeNull();

    const updated = await request(app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set(professionalAuth)
      .send({ targetWeightKg: 68.5, waterGoalMl: 2800 })
      .expect(200);
    expect(updated.body.targetWeightKg).toBe(68.5);
    expect(updated.body.waterGoalMl).toBe(2800);

    const me = await request(app.getHttpServer()).get('/client/me').set(auth).expect(200);
    expect(me.body.targetWeightKg).toBe(68.5);
    expect(me.body.waterGoalMl).toBe(2800);

    // null apaga a meta
    await request(app.getHttpServer()).patch(`/clients/${clientId}`).set(professionalAuth).send({ targetWeightKg: null }).expect(200);
    const cleared = await request(app.getHttpServer()).get('/client/me').set(auth).expect(200);
    expect(cleared.body.targetWeightKg).toBeNull();
    expect(cleared.body.waterGoalMl).toBe(2800);

    // paciente não altera as próprias metas
    await request(app.getHttpServer()).patch('/client/me').set(auth).send({ targetWeightKg: 50 }).expect(400);
  });

  it('peso: registra, lista em ordem cronológica, filtra por dias e apaga só o próprio', async () => {
    const { auth } = await setup();
    const other = await setup();

    const empty = await request(app.getHttpServer()).get('/client/weights?days=30').set(auth).expect(200);
    expect(empty.body).toEqual({ targetWeightKg: null, items: [] });

    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 80, recordedAt: old }).expect(201);
    const recent = await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 78.4 }).expect(201);
    expect(recent.body).toMatchObject({ weightKg: 78.4, source: 'self' });

    const last30 = await request(app.getHttpServer()).get('/client/weights?days=30').set(auth).expect(200);
    expect(last30.body.items.map((item: { weightKg: number }) => item.weightKg)).toEqual([78.4]);
    const all = await request(app.getHttpServer()).get('/client/weights').set(auth).expect(200);
    expect(all.body.items.map((item: { weightKg: number }) => item.weightKg)).toEqual([80, 78.4]);

    await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 5 }).expect(400);
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 70, recordedAt: future }).expect(400);

    // outro paciente não vê nem apaga
    const otherList = await request(app.getHttpServer()).get('/client/weights').set(other.auth).expect(200);
    expect(otherList.body.items).toEqual([]);
    await request(app.getHttpServer()).delete(`/client/weights/${recent.body.id}`).set(other.auth).expect(404);

    await request(app.getHttpServer()).delete(`/client/weights/${recent.body.id}`).set(auth).expect(204);
    const after = await request(app.getHttpServer()).get('/client/weights').set(auth).expect(200);
    expect(after.body.items).toHaveLength(1);
  });

  it('água: meta 2000 sem peso, 35 ml/kg com peso, meta da ficha quando existe; soma, apaga e zera o dia', async () => {
    const { professionalAuth, clientId, auth } = await setup();
    const date = today();

    const initial = await request(app.getHttpServer()).get(`/client/water?date=${date}`).set(auth).expect(200);
    expect(initial.body).toMatchObject({ date, totalMl: 0, goalMl: 2000, goalSource: 'default', entries: [] });

    await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 70 }).expect(201);
    const byWeight = await request(app.getHttpServer()).get(`/client/water?date=${date}`).set(auth).expect(200);
    expect(byWeight.body).toMatchObject({ goalMl: 2450, goalSource: 'weight' });

    await request(app.getHttpServer()).patch(`/clients/${clientId}`).set(professionalAuth).send({ waterGoalMl: 3000 }).expect(200);

    await request(app.getHttpServer()).post('/client/water').set(auth).send({ amountMl: 250, date }).expect(201);
    const day = await request(app.getHttpServer()).post('/client/water').set(auth).send({ amountMl: 500, date }).expect(201);
    expect(day.body).toMatchObject({ totalMl: 750, goalMl: 3000, goalSource: 'professional' });
    expect(day.body.entries).toHaveLength(2);

    const afterDelete = await request(app.getHttpServer())
      .delete(`/client/water/${day.body.entries[0].id}`)
      .set(auth)
      .expect(200);
    expect(afterDelete.body.totalMl).toBe(500);

    const history = await request(app.getHttpServer()).get('/client/water/history?days=7').set(auth).expect(200);
    expect(history.body.days).toEqual([{ date, totalMl: 500 }]);

    const reset = await request(app.getHttpServer()).delete(`/client/water?date=${date}`).set(auth).expect(200);
    expect(reset.body.totalMl).toBe(0);

    await request(app.getHttpServer()).post('/client/water').set(auth).send({ amountMl: 0 }).expect(400);
    await request(app.getHttpServer()).get('/client/water?date=2026-02-30').set(auth).expect(400);
  });

  it('fotos de progresso: envia, lista, gera link assinado e apaga — só do próprio paciente', async () => {
    const { auth } = await setup();
    const other = await setup();

    const uploaded = await request(app.getHttpServer())
      .post('/client/progress-photos')
      .set(auth)
      .attach('file', PNG, { filename: 'foto.png', contentType: 'image/png' })
      .expect(201);
    expect(uploaded.body).toMatchObject({ contentType: 'image/png' });
    expect(uploaded.body.storageKey).toBeUndefined();

    await request(app.getHttpServer())
      .post('/client/progress-photos')
      .set(auth)
      .attach('file', Buffer.from('texto'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);

    const list = await request(app.getHttpServer()).get('/client/progress-photos').set(auth).expect(200);
    expect(list.body).toHaveLength(1);

    const signed = await request(app.getHttpServer())
      .get(`/client/progress-photos/${uploaded.body.id}/download-url`)
      .set(auth)
      .expect(200);
    expect(signed.body.url).toMatch(/^\/files\//);
    const file = await request(app.getHttpServer()).get(signed.body.url).expect(200);
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    const otherList = await request(app.getHttpServer()).get('/client/progress-photos').set(other.auth).expect(200);
    expect(otherList.body).toEqual([]);
    await request(app.getHttpServer()).get(`/client/progress-photos/${uploaded.body.id}/download-url`).set(other.auth).expect(404);
    await request(app.getHttpServer()).delete(`/client/progress-photos/${uploaded.body.id}`).set(other.auth).expect(404);

    await request(app.getHttpServer()).delete(`/client/progress-photos/${uploaded.body.id}`).set(auth).expect(204);
    const after = await request(app.getHttpServer()).get('/client/progress-photos').set(auth).expect(200);
    expect(after.body).toEqual([]);
  });

  it('profissional não acessa as rotas de registros do paciente', async () => {
    const { professionalAuth } = await setup();
    await request(app.getHttpServer()).get('/client/weights').set(professionalAuth).expect(403);
    await request(app.getHttpServer()).get('/client/water').set(professionalAuth).expect(403);
    await request(app.getHttpServer()).get('/client/progress-photos').set(professionalAuth).expect(403);
  });

  it('exportação LGPD inclui os registros do paciente', async () => {
    const { auth } = await setup();
    await request(app.getHttpServer()).post('/client/weights').set(auth).send({ weightKg: 72 }).expect(201);
    await request(app.getHttpServer()).post('/client/water').set(auth).send({ amountMl: 300, date: today() }).expect(201);

    const exported = await request(app.getHttpServer()).post('/client/data-export').set(auth).expect(201);
    expect(exported.body.ownRecords.weights).toHaveLength(1);
    expect(exported.body.ownRecords.water).toHaveLength(1);
    expect(exported.body.ownRecords.progressPhotos).toEqual([]);
    expect(exported.body.ownRecords.photoSharing).toEqual({ shared: false, sharedAt: null });
  });

  it('nutricionista vê peso e água do próprio paciente; fotos só com autorização do paciente', async () => {
    const { professionalAuth, clientId, auth } = await setup();
    const outsider = await setup();
    const http = () => request(app.getHttpServer());
    const base = `/clients/${clientId}/tracking`;

    await http().post('/client/weights').set(auth).send({ weightKg: 71.5 }).expect(201);
    await http().post('/client/water').set(auth).send({ amountMl: 400, date: today() }).expect(201);
    const photo = await http()
      .post('/client/progress-photos')
      .set(auth)
      .attach('file', PNG, { filename: 'foto.png', contentType: 'image/png' })
      .expect(201);

    const weights = await http().get(`${base}/weights`).set(professionalAuth).expect(200);
    expect(weights.body.items.map((w: { weightKg: number }) => w.weightKg)).toEqual([71.5]);
    const water = await http().get(`${base}/water?days=7`).set(professionalAuth).expect(200);
    expect(water.body.days).toEqual([{ date: today(), totalMl: 400 }]);

    // Sem autorização: nenhuma foto, e o link direto também não abre.
    expect((await http().get(`${base}/progress-photos`).set(professionalAuth).expect(200)).body).toEqual({ shared: false, sharedAt: null, items: [] });
    await http().get(`${base}/progress-photos/${photo.body.id}/download-url`).set(professionalAuth).expect(404);

    // O paciente autoriza: o nutricionista passa a ver e abrir.
    expect((await http().get('/client/progress-photos/sharing').set(auth).expect(200)).body).toEqual({ shared: false, sharedAt: null });
    const on = await http().post('/client/progress-photos/sharing').set(auth).send({ shared: true }).expect(200);
    expect(on.body.shared).toBe(true);
    const shared = await http().get(`${base}/progress-photos`).set(professionalAuth).expect(200);
    expect(shared.body.items.map((p: { id: string }) => p.id)).toEqual([photo.body.id]);
    const url = await http().get(`${base}/progress-photos/${photo.body.id}/download-url`).set(professionalAuth).expect(200);
    expect(url.body.url).toMatch(/^\/files\//);

    // Outro nutricionista nunca vê nada deste paciente.
    await http().get(`${base}/weights`).set(outsider.professionalAuth).expect(404);
    await http().get(`${base}/progress-photos`).set(outsider.professionalAuth).expect(404);
    // O paciente não usa as rotas do nutricionista.
    await http().get(`${base}/weights`).set(auth).expect(403);

    // O paciente desliga: as fotos somem de novo para o nutricionista.
    await http().post('/client/progress-photos/sharing').set(auth).send({ shared: false }).expect(200);
    expect((await http().get(`${base}/progress-photos`).set(professionalAuth).expect(200)).body.items).toEqual([]);
    await http().get(`${base}/progress-photos/${photo.body.id}/download-url`).set(professionalAuth).expect(404);
    await http().post('/client/progress-photos/sharing').set(auth).send({ shared: 'sim' }).expect(400);
  });
});
