import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

// Fase "liberação para o app do cliente": o cliente só enxerga fotos da
// PRÓPRIA avaliação, e só depois que o profissional libera essa avaliação
// (não existe flag de liberação por foto — o gate é o da avaliação inteira).
describe('Fotos de avaliação para o cliente (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupEvaluationWithPhoto() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ heightCm: 170, weightKg: 70 })
        .expect(201)
    ).body;
    const photo = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .field('angle', 'front')
        .attach('file', JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' })
        .expect(201)
    ).body;
    return { professional, client, temporaryPassword, evaluation, photo };
  }

  async function release(professionalAccessToken: string, clientId: string, evaluationId: string) {
    await request(app.getHttpServer())
      .patch(`/clients/${clientId}/evaluations/${evaluationId}/release`)
      .set('Authorization', `Bearer ${professionalAccessToken}`)
      .send({ released: true })
      .expect(200);
  }

  it('a lista /client/evolution inclui a foto (id + ângulo) só depois de liberada; a URL assinada baixa o arquivo real', async () => {
    const { professional, client, temporaryPassword, evaluation, photo } = await setupEvaluationWithPhoto();
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const before = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(before.body.items).toEqual([]);

    await release(professional.accessToken, client.id, evaluation.id);

    const after = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].photos).toEqual([{ id: photo.id, angle: 'front' }]);

    const signed = await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .set(auth)
      .expect(200);
    expect(signed.body.url).toMatch(/^\/files\//);

    const download = await request(app.getHttpServer()).get(signed.body.url).expect(200);
    expect(download.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(download.body as Buffer, JPEG)).toBe(0);
  });

  it('sem liberação, a URL assinada da foto não é emitida (404), mesmo a foto sendo do próprio cliente', async () => {
    const { client, temporaryPassword, evaluation, photo } = await setupEvaluationWithPhoto();
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .set(auth)
      .expect(404);
  });

  it('cliente A não obtém URL assinada de foto de avaliação liberada de cliente B', async () => {
    const professional = await registerProfessional(app);
    const { client: clientA, temporaryPassword: passwordA } = await createClient(app, professional.accessToken);
    const { professional: profB, client: clientB, evaluation, photo } = await setupEvaluationWithPhoto();
    await release(profB.accessToken, clientB.id, evaluation.id);

    const sessionA = await login(app, clientA.user.email, passwordA);
    const authA = { Authorization: `Bearer ${sessionA.accessToken}` };

    await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .set(authA)
      .expect(404);
  });

  it('revogar a liberação da avaliação também tira o acesso à URL assinada da foto', async () => {
    const { professional, client, temporaryPassword, evaluation, photo } = await setupEvaluationWithPhoto();
    await release(professional.accessToken, client.id, evaluation.id);
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .set(auth)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/evaluations/${evaluation.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: false })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .set(auth)
      .expect(404);
  });

  it('sem autenticação, não há como obter a URL assinada da foto', async () => {
    const { professional, client, evaluation, photo } = await setupEvaluationWithPhoto();
    await release(professional.accessToken, client.id, evaluation.id);
    await request(app.getHttpServer())
      .get(`/client/evolution/${evaluation.id}/photos/${photo.id}/download-url`)
      .expect(401);
  });

  it('avaliação liberada sem fotos: photos vem como lista vazia (nunca undefined/omitido)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ heightCm: 170, weightKg: 70 })
        .expect(201)
    ).body;
    await release(professional.accessToken, client.id, evaluation.id);

    const session = await login(app, client.user.email, temporaryPassword);
    const list = await request(app.getHttpServer())
      .get('/client/evolution')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(list.body.items[0].photos).toEqual([]);
  });
});
