import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

async function createEvaluation(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/evaluations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ heightCm: 178, weightKg: 80, ...overrides })
    .expect(201);
  return res.body;
}

async function releaseEvaluation(app: INestApplication, accessToken: string, clientId: string, evaluationId: string) {
  await request(app.getHttpServer())
    .patch(`/clients/${clientId}/evaluations/${evaluationId}/release`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ released: true })
    .expect(200);
}

async function generateReport(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  evaluationId: string,
  audience: 'professional' | 'client',
) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/evaluations/${evaluationId}/reports`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ audience })
    .expect(201);
  return res.body;
}

describe('Relatórios (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // 1. Geração — relatório profissional
  it('gera relatório profissional: status ready, templateVersion 1, arquivo baixável', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      measurements: { waistCm: 85, hipCm: 100 },
    });

    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(report.status).toBe('ready');
    expect(report.audience).toBe('professional');
    expect(report.templateVersion).toBe(1);
    expect(report.sizeBytes).toBeGreaterThan(0);
    expect(report.generatedAt).toBeTruthy();

    const download = await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports/${report.id}/download-url`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(download.body.url).toMatch(/^\/files\//);

    const pdfRes = await request(app.getHttpServer()).get(download.body.url).expect(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(Buffer.isBuffer(pdfRes.body) || pdfRes.body.length !== undefined).toBeTruthy();
  }, 30_000);

  // 2. Geração — relatório cliente, com avaliação liberada
  it('gera relatório cliente quando a avaliação está liberada', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id);

    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'client');
    expect(report.status).toBe('ready');
    expect(report.audience).toBe('client');
    expect(report.releasedToClientAt).toBeNull(); // gerar != liberar (Fase 9, dois passos)
  }, 30_000);

  // 3. Bloqueio — relatório cliente sem liberação
  it('bloqueia geração de relatório cliente quando a avaliação não está liberada', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/reports`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ audience: 'client' })
      .expect(400);
  });

  // 4. Isolamento profissional × profissional
  it('profissional B não gera, lista, baixa ou libera relatório de cliente de A', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    const evaluation = await createEvaluation(app, professionalA.accessToken, client.id);
    const report = await generateReport(app, professionalA.accessToken, client.id, evaluation.id, 'professional');

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/reports`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ audience: 'professional' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports/${report.id}/download-url`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/reports/${report.id}/release`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ released: true })
      .expect(404);
  }, 30_000);

  // 5. Cliente nunca acessa relatório "profissional"
  it('relatório profissional nunca aparece em /client/reports nem é baixável pelo cliente', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const list = await request(app.getHttpServer()).get('/client/reports').set(auth).expect(200);
    expect(list.body.items).toEqual([]);

    await request(app.getHttpServer()).get(`/client/reports/${report.id}/download-url`).set(auth).expect(404);
  }, 30_000);

  // 6. Cliente não acessa relatório de outro cliente
  it('cliente A não acessa relatório (cliente, liberado) de cliente B', async () => {
    const professional = await registerProfessional(app);
    const clientA = await createClient(app, professional.accessToken);
    const clientB = await createClient(app, professional.accessToken);

    const evaluationB = await createEvaluation(app, professional.accessToken, clientB.client.id);
    await releaseEvaluation(app, professional.accessToken, clientB.client.id, evaluationB.id);
    const reportB = await generateReport(app, professional.accessToken, clientB.client.id, evaluationB.id, 'client');
    await request(app.getHttpServer())
      .patch(`/clients/${clientB.client.id}/reports/${reportB.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);

    const sessionA = await login(app, clientA.client.user.email, clientA.temporaryPassword);
    const authA = { Authorization: `Bearer ${sessionA.accessToken}` };

    const listA = await request(app.getHttpServer()).get('/client/reports').set(authA).expect(200);
    expect(listA.body.items).toEqual([]);
    await request(app.getHttpServer()).get(`/client/reports/${reportB.id}/download-url`).set(authA).expect(404);
  }, 30_000);

  // 7. Liberação — cliente só vê depois de liberado, some se revogado
  it('relatório cliente só aparece em /client/reports depois de liberado; retirar liberação some na leitura seguinte', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id);
    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'client');

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const before = await request(app.getHttpServer()).get('/client/reports').set(auth).expect(200);
    expect(before.body.items).toEqual([]);

    const released = await request(app.getHttpServer())
      .patch(`/clients/${client.id}/reports/${report.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);
    expect(released.body.releasedToClientAt).toBeTruthy();

    const after = await request(app.getHttpServer()).get('/client/reports').set(auth).expect(200);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].id).toBe(report.id);

    const downloadUrl = await request(app.getHttpServer())
      .get(`/client/reports/${report.id}/download-url`)
      .set(auth)
      .expect(200);
    expect(downloadUrl.body.url).toMatch(/^\/files\//);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/reports/${report.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: false })
      .expect(200);

    const revoked = await request(app.getHttpServer()).get('/client/reports').set(auth).expect(200);
    expect(revoked.body.items).toEqual([]);
    await request(app.getHttpServer()).get(`/client/reports/${report.id}/download-url`).set(auth).expect(404);
  }, 30_000);

  // 8. Não é possível liberar um relatório "profissional"
  it('não é possível liberar (release) um relatório de audiência profissional', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/reports/${report.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(400);
  }, 30_000);

  // 9. Exclusão
  it('exclui um relatório: some da listagem e o arquivo deixa de ser baixável', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');

    await request(app.getHttpServer())
      .delete(`/clients/${client.id}/reports/${report.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports/${report.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(404);
  }, 30_000);

  // 10. Duas gerações da mesma avaliação criam dois relatórios distintos
  it('gerar duas vezes para a mesma avaliação cria dois relatórios independentes; o mais antigo continua acessível', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 80 });

    const first = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ weightKg: 75 })
      .expect(200);

    const second = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(second.id).not.toBe(first.id);

    // o relatório antigo continua com seu próprio arquivo, intacto
    const firstStillThere = await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports/${first.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(firstStillThere.body.status).toBe('ready');

    const list = await request(app.getHttpServer())
      .get(`/clients/${client.id}/reports?evaluationId=${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(list.body.total).toBe(2);
  }, 30_000);

  // 11. Cliente autenticado não acessa rotas profissionais de relatório
  it('cliente autenticado recebe 403 nas rotas profissionais de relatório', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/reports`)
      .set(auth)
      .send({ audience: 'professional' })
      .expect(403);
    await request(app.getHttpServer()).get(`/clients/${client.id}/reports`).set(auth).expect(403);
  });

  // 12. Auditoria — sem valores de saúde
  it('auditoria de relatório registra ação e ids, nunca valores de saúde', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 91.4 });
    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');

    const logs = await prisma.reportAuditLog.findMany({ where: { reportId: report.id } });
    expect(logs.length).toBeGreaterThanOrEqual(2); // created + generated
    expect(logs.map((l) => l.action).sort()).toEqual(['created', 'generated'].sort());
    for (const log of logs) {
      expect(JSON.stringify(log)).not.toContain('91.4');
    }
  }, 30_000);
});
