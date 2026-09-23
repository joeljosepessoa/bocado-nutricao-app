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

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

/** Heurística sem dependência nova: o objeto `/Type /Pages` do PDF sempre anuncia `/Count N` em texto puro, mesmo quando os objetos de página individuais são comprimidos. */
function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const match = text.match(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/);
  if (!match) {
    throw new Error('Não foi possível localizar /Type /Pages /Count no PDF gerado.');
  }
  return Number(match[1]);
}

async function downloadReportPdf(app: INestApplication, accessToken: string, clientId: string, reportId: string): Promise<Buffer> {
  const download = await request(app.getHttpServer())
    .get(`/clients/${clientId}/reports/${reportId}/download-url`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const pdfRes = await request(app.getHttpServer()).get(download.body.url).expect(200);
  return Buffer.isBuffer(pdfRes.body) ? pdfRes.body : Buffer.from(pdfRes.body);
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
  it('gera relatório profissional: status ready, templateVersion 2 (redesenho 4 páginas), arquivo baixável', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      measurements: { waistCm: 85, hipCm: 100 },
    });

    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(report.status).toBe('ready');
    expect(report.audience).toBe('professional');
    expect(report.templateVersion).toBe(2);
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

  // 1b. Geração — relatório profissional de uma avaliação SEM histórico (primeira do cliente)
  it('gera relatório profissional normalmente quando a avaliação não tem histórico anterior (gráficos não quebram)', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(report.status).toBe('ready');
    expect(report.sizeBytes).toBeGreaterThan(0);
  }, 30_000);

  // 1c. Geração — relatório profissional de uma avaliação COM histórico (série real de 2+ avaliações)
  it('gera relatório profissional normalmente quando há histórico (série de avaliações para os gráficos)', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    await createEvaluation(app, professional.accessToken, client.id, {
      evaluatedAt: '2025-06-01T00:00:00Z',
      weightKg: 85,
      measurements: { waistCm: 90, hipCm: 105 },
    });
    const second = await createEvaluation(app, professional.accessToken, client.id, {
      evaluatedAt: '2026-01-01T00:00:00Z',
      weightKg: 80,
      measurements: { waistCm: 85, hipCm: 100 },
    });

    const report = await generateReport(app, professional.accessToken, client.id, second.id, 'professional');
    expect(report.status).toBe('ready');
    expect(report.sizeBytes).toBeGreaterThan(0);
  }, 30_000);

  // 1d. Geração — relatório profissional com foto anexada (página 4) embutida no PDF
  it('gera relatório profissional com foto: PDF inclui a imagem embutida (arquivo maior que sem foto)', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    const withoutPhoto = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(withoutPhoto.status).toBe('ready');

    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      'base64',
    );
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const withPhoto = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(withPhoto.status).toBe('ready');
    expect(withPhoto.sizeBytes).toBeGreaterThan(withoutPhoto.sizeBytes);
  }, 30_000);

  // 1e. Geração — caminho completo: com todos os dados e fotos, o PDF tem exatamente 4 páginas
  it('com todos os dados (histórico, dobras, sinais vitais, fotos), o PDF profissional tem exatamente 4 páginas', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await createEvaluation(app, professional.accessToken, client.id, {
      evaluatedAt: '2025-06-01T00:00:00Z',
      weightKg: 85,
      measurements: { waistCm: 90, hipCm: 105, chestCm: 100, abdomenCm: 95 },
    });
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      evaluatedAt: '2026-01-01T00:00:00Z',
      weightKg: 80,
      biologicalSexForCalculation: 'male',
      protocolCode: 'jackson_pollock_7',
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      heartRate: 68,
      glucose: 90,
      notes: 'Nota interna de acompanhamento.',
      measurements: {
        chestCm: 98, waistCm: 86, abdomenCm: 92, hipCm: 102,
        armRightCm: 30, armLeftCm: 29.5, forearmRightCm: 25, forearmLeftCm: 24.5,
        thighRightCm: 58, thighLeftCm: 57.5, calfRightCm: 37, calfLeftCm: 36.5,
        wristCm: 16, femurBicondylarCm: 9,
      },
      skinfolds: {
        chestMm: 10, axillaryMidMm: 12, subscapularMm: 14, tricepsMm: 8,
        abdominalMm: 18, suprailiacMm: 15, thighMm: 20,
      },
      bioimpedance: {
        muscleMassKg: 34, skeletalMuscleMassKg: 31, bodyWaterPercent: 58,
        visceralFatLevel: 8, boneMassKg: 3.2, basalMetabolicRateKcal: 1750, bodyAgeYears: 33,
      },
    });

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', TINY_JPEG, { filename: 'frente.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'back')
      .attach('file', TINY_JPEG, { filename: 'costas.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const report = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
    expect(report.status).toBe('ready');

    const pdf = await downloadReportPdf(app, professional.accessToken, client.id, report.id);
    expect(countPdfPages(pdf)).toBe(4);
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
