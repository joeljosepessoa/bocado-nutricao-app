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

const FULL_JP7_SKINFOLDS = {
  chestMm: 8,
  axillaryMidMm: 10,
  tricepsMm: 9,
  subscapularMm: 12,
  abdominalMm: 15,
  suprailiacMm: 11,
  thighMm: 14,
};

describe('Avaliação física (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // 1. Criação
  it('cria avaliação com dados básicos, medidas, dobras e vitais manuais', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    const body = await createEvaluation(app, professional.accessToken, client.id, {
      biologicalSexForCalculation: 'male',
      ageAtEvaluation: 30,
      protocolCode: 'jackson_pollock_7',
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      heartRate: 70,
      glucose: 90,
      measurements: { waistCm: 85, hipCm: 100 },
      skinfolds: FULL_JP7_SKINFOLDS,
    });

    expect(body.heightCm).toBe(178);
    expect(body.weightKg).toBe(80);
    expect(body.bloodPressureSystolic).toBe(120);
    expect(body.measurements.waistCm).toBe(85);
    expect(body.skinfolds.chestMm).toBe(8);
  });

  // 2. Isolamento por profissional
  it('profissional B não acessa avaliação de cliente do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    const evaluation = await createEvaluation(app, professionalA.accessToken, client.id);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 3. Cliente sem acesso técnico
  it('cliente autenticado recebe 403 em todas as rotas de avaliação', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const clientSession = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${clientSession.accessToken}` };

    await request(app.getHttpServer()).post(`/clients/${client.id}/evaluations`).set(auth).send({ heightCm: 170 }).expect(403);
    await request(app.getHttpServer()).get(`/clients/${client.id}/evaluations`).set(auth).expect(403);
    await request(app.getHttpServer()).get(`/clients/${client.id}/evaluations/${evaluation.id}`).set(auth).expect(403);
    await request(app.getHttpServer()).patch(`/clients/${client.id}/evaluations/${evaluation.id}`).set(auth).send({ notes: 'x' }).expect(403);
  });

  // 4. Dados manuais
  it('medidas e dobras retornam exatamente como enviadas', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      measurements: { waistCm: 82.5, armRightCm: 30, calfLeftCm: 36 },
      skinfolds: { tricepsMm: 12.5, calfMm: 15 },
    });

    expect(evaluation.measurements.waistCm).toBe(82.5);
    expect(evaluation.measurements.armRightCm).toBe(30);
    expect(evaluation.measurements.calfLeftCm).toBe(36);
    expect(evaluation.measurements.hipCm).toBeNull();
    expect(evaluation.skinfolds.tricepsMm).toBe(12.5);
    expect(evaluation.skinfolds.calfMm).toBe(15);
    expect(evaluation.skinfolds.chestMm).toBeNull();
  });

  // 5. Dados automáticos (bioimpedância manual)
  it('bioimpedância manual: campos não informados ficam null, nunca inventados', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      bioimpedance: { bodyFatPercent: 18.4, boneMassKg: 3.1 },
    });

    expect(evaluation.bioimpedance.origin).toBe('manual');
    expect(evaluation.bioimpedance.bodyFatPercent).toBe(18.4);
    expect(evaluation.bioimpedance.boneMassKg).toBe(3.1);
    expect(evaluation.bioimpedance.visceralFatLevel).toBeNull();
    expect(evaluation.bioimpedance.segmentalData).toBeNull();
  });

  // 6. Payload bruto — não aplicável nesta fase
  it.todo('payload bruto de balança — não aplicável: sem ingestão BLE até a Fase 10');

  // 7. Cálculos
  it('calcula IMC, classificação e relação cintura-quadril corretamente', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      heightCm: 178,
      weightKg: 80,
      measurements: { waistCm: 85, hipCm: 100 },
    });

    expect(evaluation.calculatedMetrics.bmi).toBeCloseTo(25.2, 1);
    expect(evaluation.calculatedMetrics.bmiClassification).toBe('sobrepeso');
    expect(evaluation.calculatedMetrics.waistHipRatio).toBeCloseTo(0.85, 2);
  });

  it('calcula %gordura por Jackson & Pollock 7 dobras quando as 7 dobras e sexo/idade estão presentes', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      biologicalSexForCalculation: 'male',
      ageAtEvaluation: 36,
      protocolCode: 'jackson_pollock_7',
      skinfolds: FULL_JP7_SKINFOLDS,
    });

    expect(evaluation.calculatedMetrics.bodyFatPercentSource).toBe('skinfolds');
    expect(evaluation.calculatedMetrics.bodyFatPercent).toBeCloseTo(12.3, 1);
    expect(evaluation.calculatedMetrics.protocolVersionUsed).toBe('jackson_pollock_7@v1');
    expect(evaluation.calculatedMetrics.fatMassKg).toBeCloseTo(9.84, 1);
  });

  it('não calcula %gordura por dobras se faltar qualquer uma das 7 dobras exigidas', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const { thighMm, ...incomplete } = FULL_JP7_SKINFOLDS;
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      biologicalSexForCalculation: 'male',
      ageAtEvaluation: 36,
      protocolCode: 'jackson_pollock_7',
      skinfolds: incomplete,
    });

    expect(evaluation.calculatedMetrics.bodyFatPercentSource).toBeNull();
    expect(evaluation.calculatedMetrics.bodyFatPercent).toBeNull();
  });

  it('idade calculada automaticamente a partir do birthDate do cliente quando não informada', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken, { birthDate: '1990-01-01' });
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(evaluation.ageAtEvaluation).toBe(36);
  });

  // 8. Fotos
  it('upload, leitura via URL assinada e remoção de foto funcionam', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      'base64',
    );

    const upload = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.angle).toBe('front');

    const signed = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${upload.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(signed.body.url).toMatch(/^\/files\//);

    const download = await request(app.getHttpServer()).get(signed.body.url).expect(200);
    expect(download.body.length).toBe(jpeg.length);

    await request(app.getHttpServer())
      .delete(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${upload.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(204);

    await request(app.getHttpServer()).get(signed.body.url).expect(404);
  });

  it('rejeita upload com tipo de arquivo não suportado', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', Buffer.from('not an image'), { filename: 'arquivo.txt', contentType: 'text/plain' })
      .expect(400);
  });

  // 9. Histórico
  it('lista as avaliações de um cliente em ordem cronológica decrescente', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    await createEvaluation(app, professional.accessToken, client.id, { evaluatedAt: '2026-01-01T00:00:00.000Z' });
    await createEvaluation(app, professional.accessToken, client.id, { evaluatedAt: '2026-03-01T00:00:00.000Z' });

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    const dates = res.body.items.map((item: { evaluatedAt: string }) => new Date(item.evaluatedAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  // 10. Comparação
  it('compara duas avaliações e devolve os deltas corretos', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const first = await createEvaluation(app, professional.accessToken, client.id, {
      weightKg: 85,
      measurements: { waistCm: 90, hipCm: 100 },
    });
    const second = await createEvaluation(app, professional.accessToken, client.id, {
      weightKg: 80,
      measurements: { waistCm: 86, hipCm: 100 },
    });

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/compare?from=${first.id}&to=${second.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.deltas.weightKg).toBeCloseTo(-5, 5);
    expect(res.body.deltas.waistCm).toBeCloseTo(-4, 5);
    expect(res.body.deltas.hipCm).toBeCloseTo(0, 5);
  });

  it('delta vem null quando o campo falta em qualquer uma das duas avaliações comparadas', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const first = await createEvaluation(app, professional.accessToken, client.id, { measurements: {} });
    const second = await createEvaluation(app, professional.accessToken, client.id, {
      measurements: { waistCm: 80 },
    });

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/compare?from=${first.id}&to=${second.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.deltas.waistCm).toBeNull();
  });

  // 11. Permissões
  it('evaluationId válido mas de outro cliente/profissional retorna 404', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client: clientA } = await createClient(app, professionalA.accessToken);
    const { client: clientB } = await createClient(app, professionalB.accessToken);
    const evaluationOfA = await createEvaluation(app, professionalA.accessToken, clientA.id);

    // profissional B, usando o próprio cliente B na rota, mas o id de uma avaliação de A
    await request(app.getHttpServer())
      .get(`/clients/${clientB.id}/evaluations/${evaluationOfA.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 12. Validações
  it('rejeita altura/peso negativos', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: -178, weightKg: 80 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 178, weightKg: -80 })
      .expect(400);
  });

  it('rejeita angle de foto inválido', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'de-cima')
      .attach('file', Buffer.from('x'), { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });

  it('criar avaliação para clientId inexistente ou de outro profissional retorna 404', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/clients/00000000-0000-0000-0000-000000000000/evaluations')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 178 })
      .expect(404);
  });

  it('protocolCode desconhecido retorna 400', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 178, protocolCode: 'protocolo-que-nao-existe' })
      .expect(400);
  });

  // Auditoria
  it('registra ações de auditoria sem armazenar valores de saúde', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      weightKg: 80,
      skinfolds: FULL_JP7_SKINFOLDS,
    });

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const logs = await prisma.evaluationAuditLog.findMany({ where: { evaluationId: evaluation.id } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['created', 'read']));
    for (const log of logs) {
      const keys = Object.keys(log);
      expect(keys).not.toContain('weightKg');
      expect(keys).not.toContain('skinfolds');
      expect(keys).not.toContain('bodyFatPercent');
    }
  });
});
