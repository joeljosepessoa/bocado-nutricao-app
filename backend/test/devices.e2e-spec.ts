import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, registerProfessional } from './helpers';

const prisma = new PrismaClient();

async function consentAndConnect(
  app: INestApplication,
  clientAccessToken: string,
  overrides: Record<string, unknown> = {},
) {
  await request(app.getHttpServer())
    .post('/client/devices/consent')
    .set('Authorization', `Bearer ${clientAccessToken}`)
    .expect(204);
  const res = await request(app.getHttpServer())
    .post('/client/devices')
    .set('Authorization', `Bearer ${clientAccessToken}`)
    .send({ sourceType: 'ble_direct', driverId: 'heart-rate-service-v1', deviceIdentifier: 'AA:BB:CC:00:11:22', ...overrides })
    .expect(201);
  return res.body;
}

function samplePayload(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const started = new Date(now.getTime() - 60_000);
  return {
    metricType: 'heart_rate',
    value: 72,
    unit: 'bpm',
    startedAt: started.toISOString(),
    endedAt: now.toISOString(),
    externalId: `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    ...overrides,
  };
}

/**
 * Contrato de GET /clients/:id/devices (DeviceConnectionSummaryDto): SÓ metadados da conexão.
 * Qualquer chave fora desta lista é vazamento, seja qual for o nome dela.
 */
const CONNECTION_SUMMARY_KEYS = [
  'connectedAt',
  'deviceIdentifier',
  'driverId',
  'id',
  'lastSyncedAt',
  'revokedAt',
  'sharedWithProfessional',
  'sourceType',
  'status',
];

/**
 * Campos que carregam a métrica (DeviceMetricSampleDto + colunas de DeviceMetricSample). Ficam
 * listados por nome para a falha apontar exatamente o campo vazado (a checagem de chaves acima
 * já os barraria, mas a mensagem seria só "arrays diferentes").
 */
const METRIC_FIELDS = [
  'value',
  'metricType',
  'unit',
  'startedAt',
  'endedAt',
  'precision',
  'externalId',
  'dedupHash',
  'rawPayload',
  'samples',
];

/** Procura um valor NUMÉRICO (por tipo e igualdade, nunca por substring) em qualquer nível do JSON. */
function containsNumber(node: unknown, target: number): boolean {
  if (typeof node === 'number') return node === target;
  if (Array.isArray(node)) return node.some((item) => containsNumber(item, target));
  if (node !== null && typeof node === 'object') {
    return Object.values(node).some((item) => containsNumber(item, target));
  }
  return false;
}

async function loginAsClient(app: INestApplication, client: { user: { email: string } }, temporaryPassword: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: client.user.email, password: temporaryPassword })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Dispositivos e wearables (e2e)', () => {
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

  // 1. Consentimento obrigatório antes de conectar
  it('rejeita criar conexão sem consentimento prévio', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);

    await request(app.getHttpServer())
      .post('/client/devices')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ sourceType: 'ble_direct' })
      .expect(400);
  });

  // 2. Consentimento é idempotente e habilita criação
  it('consentimento aceito permite criar conexão; repetir o consentimento não falha', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);

    await request(app.getHttpServer())
      .post('/client/devices/consent')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/client/devices/consent')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(204);

    const connection = await consentAndConnect(app, clientToken);
    expect(connection.sourceType).toBe('ble_direct');
  });

  // 3. sharedWithProfessional=false por padrão
  it('nova conexão nasce com sharedWithProfessional=false', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);

    const connection = await consentAndConnect(app, clientToken);
    expect(connection.sharedWithProfessional).toBe(false);
    expect(connection.status).toBe('active');
  });

  // 4. Compartilhamento explícito habilita visão do profissional
  it('profissional só vê métricas depois do cliente compartilhar explicitamente', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);

    await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload()] })
      .expect(201);

    const beforeShare = await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices/metrics`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(beforeShare.body.items).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/client/devices/${connection.id}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ sharedWithProfessional: true })
      .expect(200);

    const afterShare = await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices/metrics`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(afterShare.body.items).toHaveLength(1);
    expect(afterShare.body.items[0].deviceConnectionId).toBe(connection.id);
  });

  // 5. Revogação impede novas sincronizações e para o compartilhamento
  it('revogar a conexão bloqueia nova ingestão e desliga o compartilhamento', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);

    await request(app.getHttpServer())
      .patch(`/client/devices/${connection.id}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ sharedWithProfessional: true })
      .expect(200);

    const revoked = await request(app.getHttpServer())
      .patch(`/client/devices/${connection.id}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ status: 'revoked' })
      .expect(200);
    expect(revoked.body.status).toBe('revoked');
    expect(revoked.body.sharedWithProfessional).toBe(false);

    await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload()] })
      .expect(400);
  });

  // 6. Ingestão cria amostras corretamente, com origem rastreável
  it('ingestão cria amostras vinculadas à conexão de origem', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);

    const res = await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload({ value: 65 }), samplePayload({ metricType: 'steps', value: 4200, unit: 'steps' })] })
      .expect(201);

    expect(res.body).toEqual({ inserted: 2, duplicates: 0, rejected: [] });

    const rows = await prisma.deviceMetricSample.findMany({ where: { deviceConnectionId: connection.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.deviceConnectionId === connection.id && r.clientId === client.id)).toBe(true);
  });

  // 7. dedupHash — reenviar o mesmo lote não duplica
  it('sincronização repetida do mesmo lote não cria duplicatas (dedupHash)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);
    const payload = { samples: [samplePayload(), samplePayload({ metricType: 'steps', value: 1000, unit: 'steps' })] };

    const first = await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send(payload)
      .expect(201);
    expect(first.body.inserted).toBe(2);

    const second = await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send(payload)
      .expect(201);
    expect(second.body).toEqual({ inserted: 0, duplicates: 2, rejected: [] });

    const rows = await prisma.deviceMetricSample.count({ where: { deviceConnectionId: connection.id } });
    expect(rows).toBe(2);
  });

  // 8. Valor implausível é rejeitado sem derrubar o lote inteiro
  it('rejeita amostra com valor fora da faixa plausível, sem afetar as demais do lote', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);

    const res = await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload({ value: 900 }), samplePayload({ metricType: 'steps', value: 500, unit: 'steps' })] })
      .expect(201);

    expect(res.body.inserted).toBe(1);
    expect(res.body.rejected).toHaveLength(1);
    expect(res.body.rejected[0].index).toBe(0);
  });

  // 9. Isolamento entre clientes
  it('cliente A não acessa nem altera conexão do cliente B', async () => {
    const professional = await registerProfessional(app);
    const { client: clientA, temporaryPassword: pwA } = await createClient(app, professional.accessToken);
    const { client: clientB, temporaryPassword: pwB } = await createClient(app, professional.accessToken);
    const tokenA = await loginAsClient(app, clientA, pwA);
    const tokenB = await loginAsClient(app, clientB, pwB);
    const connectionB = await consentAndConnect(app, tokenB);

    await request(app.getHttpServer())
      .patch(`/client/devices/${connectionB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sharedWithProfessional: true })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/client/devices/${connectionB.id}/metrics`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ samples: [samplePayload()] })
      .expect(404);

    const listA = await request(app.getHttpServer())
      .get('/client/devices')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.items).toHaveLength(0);
  });

  // 10. Isolamento entre profissionais
  it('profissional B não acessa dispositivos/métricas de cliente do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professionalA.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    await consentAndConnect(app, clientToken);

    const professionalB = await registerProfessional(app);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices/metrics`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 11. Endpoints protegidos por role — cliente não usa rota do profissional e vice-versa
  it('bloqueia cliente em rota de profissional e profissional em rota de cliente', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/client/devices')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(403);
  });

  // 12. Sem autenticação
  it('bloqueia acesso sem token', async () => {
    await request(app.getHttpServer()).get('/client/devices').expect(401);
  });

  // 13. Profissional enxerga metadados da conexão (sem métrica) mesmo sem compartilhamento
  it('profissional vê status/fonte da conexão mesmo sem compartilhamento, mas nunca a métrica', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);
    const sentValue = 61;
    await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload({ value: sentValue })] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/devices`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sharedWithProfessional).toBe(false);

    // Verifica o contrato (chaves), não o texto: o JSON traz UUID e timestamps aleatórios, e uma
    // busca de substring por "61" falhava sempre que um deles continha "61" por acaso.
    expect(Object.keys(res.body[0]).sort()).toEqual(CONNECTION_SUMMARY_KEYS);
    for (const field of METRIC_FIELDS) {
      expect(res.body[0]).not.toHaveProperty(field);
    }
    // E o valor enviado não aparece como valor em lugar nenhum da resposta.
    expect(containsNumber(res.body, sentValue)).toBe(false);
  });

  // 14. Auditoria nunca contém valor de métrica
  it('auditoria registra ação e ids, nunca o valor da métrica', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);
    await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload({ value: 123.5 })] })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/client/devices/${connection.id}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ sharedWithProfessional: true })
      .expect(200);

    const logs = await prisma.deviceAuditLog.findMany({ where: { deviceConnectionId: connection.id } });
    expect(logs.map((l) => l.action).sort()).toEqual(
      ['connection_created', 'metrics_ingested', 'share_enabled'].sort(),
    );
    for (const log of logs) {
      expect(JSON.stringify(log)).not.toContain('123.5');
    }
  });

  // 15. Cliente lê as próprias amostras (sem depender de compartilhamento)
  it('cliente lê as próprias amostras mesmo sem compartilhar com o profissional', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    const connection = await consentAndConnect(app, clientToken);
    await request(app.getHttpServer())
      .post(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ samples: [samplePayload({ value: 88 })] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/client/devices/${connection.id}/metrics`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].value).toBe(88);
  });

  // 16. Cliente A não lê amostras da conexão do cliente B
  it('cliente A não lê amostras da conexão do cliente B', async () => {
    const professional = await registerProfessional(app);
    const { client: clientA, temporaryPassword: pwA } = await createClient(app, professional.accessToken);
    const { client: clientB, temporaryPassword: pwB } = await createClient(app, professional.accessToken);
    const tokenA = await loginAsClient(app, clientA, pwA);
    const tokenB = await loginAsClient(app, clientB, pwB);
    const connectionB = await consentAndConnect(app, tokenB);

    await request(app.getHttpServer())
      .get(`/client/devices/${connectionB.id}/metrics`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
