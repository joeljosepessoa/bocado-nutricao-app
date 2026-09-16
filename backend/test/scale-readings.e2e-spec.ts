import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, registerProfessional } from './helpers';

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

function readingKey() {
  return `mock-scale.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}`;
}

function confirmPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: 'confirmed',
    driverId: 'mock-scale-v1',
    deviceIdentifier: 'AA:BB:CC:DD:EE:FF',
    protocolVersion: '1.0',
    recordedAt: new Date().toISOString(),
    idempotencyKey: readingKey(),
    rawPayload: { bytesBase64: 'AQIDBA==' },
    normalized: { weightKg: 82.4, bodyFatPercent: 18.2, muscleMassKg: 60.1 },
    ...overrides,
  };
}

describe('Leituras de balança — BLE (e2e)', () => {
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

  // 1. Confirmação aplica Bioimpedance com origin=device_confirmed
  it('confirma leitura e grava Bioimpedance com origin=device_confirmed', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload())
      .expect(201);

    expect(res.body.status).toBe('confirmed');
    expect(res.body.evaluationId).toBe(evaluation.id);
    expect(res.body.rawPayload).toBeUndefined();

    const detail = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(detail.body.bioimpedance.origin).toBe('device_confirmed');
    expect(detail.body.bioimpedance.muscleMassKg).toBe(60.1);
  }, 30_000);

  // 2. Descarte não altera a avaliação
  it('leitura descartada cria registro mas não altera Bioimpedance da avaliação', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload({ status: 'discarded', normalized: undefined }))
      .expect(201);
    expect(res.body.status).toBe('discarded');

    const detail = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(detail.body.bioimpedance).toBeNull();
  });

  // 3. Confirmar sem normalized é rejeitado
  it('rejeita confirmação sem normalized', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload({ normalized: undefined }))
      .expect(400);
  });

  // 4. Idempotência — mesmo idempotencyKey duas vezes não duplica
  it('reenviar a mesma idempotencyKey não cria uma segunda leitura', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);
    const payload = confirmPayload();

    const first = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(payload)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(payload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const rows = await prisma.scaleReading.findMany({ where: { idempotencyKey: payload.idempotencyKey } });
    expect(rows).toHaveLength(1);
  });

  // 5. idempotencyKey reaproveitada em outra avaliação é rejeitada
  it('rejeita idempotencyKey já usada em outra avaliação', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluationA = await createEvaluation(app, professional.accessToken, client.id);
    const evaluationB = await createEvaluation(app, professional.accessToken, client.id);
    const payload = confirmPayload();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluationA.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluationB.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(payload)
      .expect(400);
  });

  // 6. Isolamento entre profissionais
  it('profissional B recebe 404 ao confirmar/listar leitura de avaliação do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    const evaluation = await createEvaluation(app, professionalA.accessToken, client.id);

    const professionalB = await registerProfessional(app);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send(confirmPayload())
      .expect(404);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 7. Cliente não usa endpoint do profissional
  it('cliente recebe 403 ao tentar confirmar ou listar leituras de balança', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    const clientLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${clientLogin.body.accessToken}`)
      .send(confirmPayload())
      .expect(403);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${clientLogin.body.accessToken}`)
      .expect(403);
  });

  // 8. Listagem nunca inclui rawPayload
  it('lista leituras da avaliação sem expor rawPayload', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload({ status: 'discarded', normalized: undefined }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((r: { status: string }) => r.status).sort()).toEqual(['confirmed', 'discarded']);
    for (const item of res.body) {
      expect(item.rawPayload).toBeUndefined();
    }
  });

  // 9. Recalcula métricas — %gordura da bioimpedância alimenta CalculatedMetrics
  it('leitura confirmada recalcula %gordura/massa a partir da bioimpedância', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 80 });

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload({ normalized: { bodyFatPercent: 20 } }))
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(detail.body.calculatedMetrics.bodyFatPercent).toBe(20);
    expect(detail.body.calculatedMetrics.bodyFatPercentSource).toBe('bioimpedance');
    expect(detail.body.calculatedMetrics.fatMassKg).toBe(16);
  });

  // 10. Auditoria — nunca valores de saúde
  it('auditoria de balança registra ação e ids, nunca peso/%gordura/payload', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send(confirmPayload({ normalized: { bodyFatPercent: 18.75 } }))
      .expect(201);
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/scale-readings`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const logs = await prisma.scaleAuditLog.findMany({ where: { evaluationId: evaluation.id } });
    expect(logs.map((l) => l.action).sort()).toEqual(['reading_confirmed', 'reading_listed'].sort());
    for (const log of logs) {
      expect(JSON.stringify(log)).not.toContain('18.75');
    }
  });
});
