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

async function releaseEvaluation(app: INestApplication, accessToken: string, clientId: string, evaluationId: string) {
  await request(app.getHttpServer())
    .patch(`/clients/${clientId}/evaluations/${evaluationId}/release`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ released: true })
    .expect(200);
}

async function grantProfessionalConsent(app: INestApplication, accessToken: string) {
  await request(app.getHttpServer())
    .post('/professionals/me/ai/consent')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
}

async function grantClientConsent(app: INestApplication, clientAccessToken: string) {
  await request(app.getHttpServer())
    .post('/client/ai/consent')
    .set('Authorization', `Bearer ${clientAccessToken}`)
    .expect(201);
}

async function loginAsClient(app: INestApplication, client: { user: { email: string } }, temporaryPassword: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: client.user.email, password: temporaryPassword })
    .expect(200);
  return res.body.accessToken as string;
}

async function setupProfessionalClientWithConsent(app: INestApplication) {
  const professional = await registerProfessional(app);
  const { client, temporaryPassword } = await createClient(app, professional.accessToken);
  const clientToken = await loginAsClient(app, client, temporaryPassword);
  await grantProfessionalConsent(app, professional.accessToken);
  await grantClientConsent(app, clientToken);
  return { professional, client, clientToken };
}

describe('IA assistiva (e2e)', () => {
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

  // 1. Sem nenhum consentimento
  it('bloqueia geração sem nenhum consentimento', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'Cliente relatou boa adesão à dieta.', entityType: 'diet' })
      .expect(403);
  });

  // 2. Consentimento do profissional é obrigatório
  it('bloqueia mesmo com o cliente consentindo, se o profissional não consentiu', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    await grantClientConsent(app, clientToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'texto', entityType: 'diet' })
      .expect(403);
  });

  // 3. Consentimento do cliente é obrigatório
  it('bloqueia mesmo com o profissional consentindo, se o cliente não consentiu', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    await grantProfessionalConsent(app, professional.accessToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'texto', entityType: 'diet' })
      .expect(403);
  });

  // 4. Consentimentos são independentes e idempotentes
  it('os dois consentimentos são independentes e repetir o consentimento não falha', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);

    await grantProfessionalConsent(app, professional.accessToken);
    await grantProfessionalConsent(app, professional.accessToken); // idempotente
    await grantClientConsent(app, clientToken);
    await grantClientConsent(app, clientToken); // idempotente

    const record = await prisma.professional.findUniqueOrThrow({
      where: { id: professional.user.id },
      select: { aiFeaturesConsentAt: true },
    });
    expect(record.aiFeaturesConsentAt).toBeTruthy();
  });

  // 5. draft_note — com os dois consentimentos, gera um rascunho
  it('draft_note gera um rascunho a partir das instruções do profissional', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'Cliente relatou dor leve no joelho direito durante agachamento.', entityType: 'workout' })
      .expect(201);

    expect(res.body.feature).toBe('draft_note');
    expect(res.body.isAiGenerated).toBe(true);
    expect(res.body.text).toContain('joelho');
    expect(res.body.promptVersion).toBe('draft_note@v1');
    expect(res.body.provider).toBe('mock-local');
  });

  // 6. explain_evaluation — avaliação NÃO liberada é rejeitada
  it('explain_evaluation rejeita avaliação ainda não liberada ao cliente', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'explain_evaluation', evaluationId: evaluation.id })
      .expect(404);
  });

  // 7. explain_evaluation — avaliação liberada funciona, e nunca contém dado técnico
  it('explain_evaluation funciona para avaliação liberada, usando só o allowlist client-safe', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, {
      weightKg: 82,
      skinfolds: { tricepsMm: 12, subscapularMm: 15, chestMm: 10, axillaryMidMm: 11, abdominalMm: 20, suprailiacMm: 14, thighMm: 18 },
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      notes: 'nota interna confidencial do profissional',
    });
    await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'explain_evaluation', evaluationId: evaluation.id })
      .expect(201);

    expect(res.body.text).toContain('82');
    expect(res.body.text.toLowerCase()).not.toContain('confidencial');
    expect(res.body.text).not.toMatch(/120|80/); // pressão nunca entra no contexto

    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { contextRef: evaluation.id } });
    const contextKeys = Object.keys(log.contextSummary as Record<string, unknown>).sort();
    expect(contextKeys).toEqual(
      ['bmi', 'bmiClassification', 'bodyFatPercent', 'composition', 'evaluatedAt', 'fatMassKg', 'leanMassKg', 'measurements', 'weightKg'].sort(),
    );
  });

  // 8. narrate_trend — menos de 2 avaliações liberadas
  it('narrate_trend recusa quando há menos de duas avaliações liberadas — nunca inventa tendência', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 80 });
    await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'narrate_trend' })
      .expect(400);
  });

  // 9. narrate_trend — com 2 avaliações liberadas, narra a tendência já calculada
  it('narrate_trend narra a tendência calculada deterministicamente entre as duas últimas liberadas', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    const first = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 85, evaluatedAt: '2026-01-01T00:00:00.000Z' });
    await releaseEvaluation(app, professional.accessToken, client.id, first.id);
    const second = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 80, evaluatedAt: '2026-02-01T00:00:00.000Z' });
    await releaseEvaluation(app, professional.accessToken, client.id, second.id);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'narrate_trend' })
      .expect(201);

    expect(res.body.text).toContain('Peso');
    expect(res.body.text).toContain('-5'); // delta determinístico: 80 - 85

    const log = await prisma.aiInteractionLog.findFirstOrThrow({
      where: { professionalId: professional.user.id, feature: 'narrate_trend' },
      orderBy: { createdAt: 'desc' },
    });
    const context = log.contextSummary as { metrics: Array<{ label: string; delta: number }> };
    expect(context.metrics.find((m) => m.label === 'Peso')?.delta).toBe(-5);
  });

  // 10. Isolamento entre profissionais
  it('profissional B não usa IA sobre cliente do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    await grantProfessionalConsent(app, professionalA.accessToken);

    const professionalB = await registerProfessional(app);
    await grantProfessionalConsent(app, professionalB.accessToken);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'x', entityType: 'diet' })
      .expect(404);
  });

  // 11. Cliente só solicita explicação sobre o próprio dado já liberado
  it('cliente A não recebe explicação sobre avaliação do cliente B', async () => {
    const professional = await registerProfessional(app);
    const { client: clientA, temporaryPassword: pwA } = await createClient(app, professional.accessToken);
    const { client: clientB, temporaryPassword: pwB } = await createClient(app, professional.accessToken);
    const tokenA = await loginAsClient(app, clientA, pwA);
    const tokenB = await loginAsClient(app, clientB, pwB);
    await grantProfessionalConsent(app, professional.accessToken);
    await grantClientConsent(app, tokenA);
    await grantClientConsent(app, tokenB);

    const evaluationB = await createEvaluation(app, professional.accessToken, clientB.id);
    await releaseEvaluation(app, professional.accessToken, clientB.id, evaluationB.id);

    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ feature: 'explain_evaluation', evaluationId: evaluationB.id })
      .expect(404);
  });

  // 12. Cliente consegue usar a própria explicação/narração (mobile — Fase 8 mantida)
  it('cliente consegue pedir explicação e narração sobre o próprio dado liberado', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    await grantProfessionalConsent(app, professional.accessToken);
    await grantClientConsent(app, clientToken);

    const first = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 90 });
    await releaseEvaluation(app, professional.accessToken, client.id, first.id);
    const second = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 88 });
    await releaseEvaluation(app, professional.accessToken, client.id, second.id);

    const explain = await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'explain_evaluation', evaluationId: second.id })
      .expect(201);
    expect(explain.body.text).toContain('88');

    const narrate = await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'narrate_trend' })
      .expect(201);
    expect(narrate.body.text).toContain('Peso');
  });

  // 13. Cliente não pode chamar draft_note (ferramenta só do profissional)
  it('cliente não pode invocar draft_note', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientToken = await loginAsClient(app, client, temporaryPassword);
    await grantProfessionalConsent(app, professional.accessToken);
    await grantClientConsent(app, clientToken);

    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'draft_note' })
      .expect(400);
  });

  // 14. Papéis errados são bloqueados
  it('bloqueia cliente em rota de profissional e vice-versa', async () => {
    const { professional, client, clientToken } = await setupProfessionalClientWithConsent(app);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'draft_note', instructions: 'x', entityType: 'diet' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'narrate_trend' })
      .expect(403);
  });

  // 15. Human-in-the-loop: gerar conteúdo nunca altera PhysicalEvaluation/Diet/Workout
  it('gerar conteúdo de IA nunca altera a avaliação, a dieta ou o treino automaticamente', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    const evaluation = await createEvaluation(app, professional.accessToken, client.id, { weightKg: 77 });
    await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id);

    const before = await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id: evaluation.id } });

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'explain_evaluation', evaluationId: evaluation.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'Ajustar treino de perna.', entityType: 'workout' })
      .expect(201);

    const after = await prisma.physicalEvaluation.findUniqueOrThrow({ where: { id: evaluation.id } });
    expect(after).toEqual(before);

    const dietsCount = await prisma.diet.count({ where: { clientId: client.id } });
    const workoutsCount = await prisma.workout.count({ where: { clientId: client.id } });
    expect(dietsCount).toBe(0);
    expect(workoutsCount).toBe(0);
  });

  // 16. Versionamento — promptVersion é gravado e reproduzível
  it('grava provider/model/promptVersion/status em AiInteractionLog para cada geração', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'texto de teste', entityType: 'evaluation' })
      .expect(201);

    const log = await prisma.aiInteractionLog.findFirstOrThrow({
      where: { clientId: client.id, feature: 'draft_note' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.provider).toBe('mock-local');
    expect(log.model).toBe('mock-v1');
    expect(log.promptVersion).toBe('draft_note@v1');
    expect(log.status).toBe('succeeded');
    expect(log.responseText).toBeTruthy();
  });

  // 17. Auditoria nunca contém prompt/contexto/resposta
  it('AiAuditLog registra a ação mas nunca prompt, contexto ou resposta', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'informação sensível única xyzsegredo', entityType: 'evaluation' })
      .expect(201);

    const logs = await prisma.aiAuditLog.findMany({ where: { clientId: client.id } });
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(['generation_requested', 'generation_succeeded']),
    );
    for (const log of logs) {
      expect(JSON.stringify(log)).not.toContain('xyzsegredo');
    }
  });

  // 18. Ação de bloqueio por falta de consentimento também é auditada
  it('tentativa bloqueada por falta de consentimento gera generation_blocked na auditoria', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    await grantProfessionalConsent(app, professional.accessToken);
    // cliente nunca consentiu

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'x', entityType: 'diet' })
      .expect(403);

    const logs = await prisma.aiAuditLog.findMany({ where: { clientId: client.id, action: 'generation_blocked' } });
    expect(logs).toHaveLength(1);
  });

  // 19. Histórico do profissional — metadado, nunca de outro profissional
  it('profissional só lista o próprio histórico de interações de IA', async () => {
    const { professional, client } = await setupProfessionalClientWithConsent(app);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'draft_note', instructions: 'x', entityType: 'diet' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/ai/interactions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].feature).toBe('draft_note');

    const otherProfessional = await registerProfessional(app);
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/ai/interactions`)
      .set('Authorization', `Bearer ${otherProfessional.accessToken}`)
      .expect(404);
  });
});
