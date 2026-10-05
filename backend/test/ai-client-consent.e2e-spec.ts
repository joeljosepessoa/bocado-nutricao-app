import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { createClient, createDiet, registerProfessional } from './helpers';

const prisma = new PrismaClient();
const CONSENT_MESSAGE =
  'O cliente ainda não autorizou o processamento de dados por IA. Peça ao cliente que acesse Privacidade e dados no aplicativo e autorize o uso de inteligência artificial.';

// Provedor roteirizado no lugar do mock local (mesmo id) — consentimento, política e logs reais.
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};

const ORGANIZED = {
  days: [
    {
      name: 'Dia A',
      notes: null,
      exercises: [
        {
          name: 'Supino',
          muscleGroup: null,
          notes: null,
          setGroups: [
            { count: 3, reps: 10, repsMin: null, repsMax: null, restSeconds: null, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, tempo: null, notes: null },
          ],
          warnings: [],
        },
      ],
    },
  ],
  warnings: [],
};

describe('Consentimento de IA do cliente — política por recurso (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockAiProvider)
      .useValue(fakeProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    fakeProvider.generate.mockReset();
    // Saída estruturada só para organize_workout; os demais recursos recebem texto.
    fakeProvider.generate.mockImplementation(async (req) => ({
      text: req.responseSchema ? JSON.stringify(ORGANIZED) : 'Texto gerado pela IA de teste.',
      model: 'fake-model',
    }));
  });

  const http = () => request(app.getHttpServer());

  /** Profissional com a PRÓPRIA ativação de IA + cliente logada (sem consentimento) + 2 avaliações liberadas. */
  async function setup() {
    const professional = await registerProfessional(app);
    const proAuth = { Authorization: `Bearer ${professional.accessToken}` };
    await http().post('/professionals/me/ai/consent').set(proAuth).expect(201);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken, { fullName: `Mariana Teste ${Date.now()}` });
    const login = await http().post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const clientAuth = { Authorization: `Bearer ${login.body.accessToken}` };
    const evaluationIds: string[] = [];
    for (const weightKg of [82, 79]) {
      const evaluation = (await http().post(`/clients/${client.id}/evaluations`).set(proAuth).send({ heightCm: 170, weightKg }).expect(201)).body;
      await http().patch(`/clients/${client.id}/evaluations/${evaluation.id}/release`).set(proAuth).send({ released: true }).expect(200);
      evaluationIds.push(evaluation.id);
    }
    return { professional, proAuth, client, clientAuth, evaluationIds };
  }

  type Ctx = Awaited<ReturnType<typeof setup>>;
  const organize = ({ proAuth, client }: Ctx) =>
    http().post(`/clients/${client.id}/ai/generate`).set(proAuth).send({ feature: 'organize_workout', workoutText: 'Dia A\nSupino 3x10' });
  const draftNote = ({ proAuth, client }: Ctx) =>
    http().post(`/clients/${client.id}/ai/generate`).set(proAuth).send({ feature: 'draft_note', instructions: 'Boa adesão.', entityType: 'diet' });
  const explain = ({ clientAuth, evaluationIds }: Ctx) =>
    http().post('/client/ai/generate').set(clientAuth).send({ feature: 'explain_evaluation', evaluationId: evaluationIds[1] });
  const narrate = ({ clientAuth }: Ctx) => http().post('/client/ai/generate').set(clientAuth).send({ feature: 'narrate_trend' });
  const explainByProfessional = ({ proAuth, client, evaluationIds }: Ctx) =>
    http().post(`/clients/${client.id}/ai/generate`).set(proAuth).send({ feature: 'explain_evaluation', evaluationId: evaluationIds[1] });

  it('sem consentimento: organize_workout funciona e só envia o texto do profissional; recursos com dado da cliente bloqueiam', async () => {
    const ctx = await setup();

    // 1. organize_workout sem consentimento da cliente.
    await organize(ctx).expect(201);
    // 2. Nada da cliente vai ao provedor — só o texto escrito pelo profissional.
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
    const sent = fakeProvider.generate.mock.calls[0][0];
    expect(sent.context).toEqual({ workoutText: 'Dia A\nSupino 3x10' });
    const payload = JSON.stringify({ system: sent.systemPrompt, context: sent.context });
    for (const forbidden of [ctx.client.id, ctx.client.user.email, ctx.client.user.fullName, ctx.client.user.fullName.split(' ')[0], '82', '79']) {
      expect(payload).not.toContain(forbidden);
    }
    const organizeLog = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: ctx.client.id, feature: 'organize_workout' } });
    expect(organizeLog.processingPolicy).toBe('professional_material');

    // 3–5. draft_note, explain_evaluation e narrate_trend continuam exigindo consentimento.
    expect((await draftNote(ctx).expect(403)).body.message).toBe(CONSENT_MESSAGE);
    expect((await explain(ctx).expect(403)).body.message).toBe(CONSENT_MESSAGE);
    expect((await narrate(ctx).expect(403)).body.message).toBe(CONSENT_MESSAGE);
    expect((await explainByProfessional(ctx).expect(403)).body.message).toBe(CONSENT_MESSAGE);
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('consulta, concessão e revogação auditada; após revogar, os protegidos bloqueiam e organize_workout continua', async () => {
    const ctx = await setup();
    await createDiet(app, ctx.professional.accessToken, ctx.client.id);

    // 6. Consulta: não autorizado.
    expect((await http().get('/client/ai/consent').set(ctx.clientAuth).expect(200)).body).toEqual({ aiDataProcessingConsentAt: null });

    const granted = await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    expect(granted.body.aiDataProcessingConsentAt).toEqual(expect.any(String));
    expect((await http().get('/client/ai/consent').set(ctx.clientAuth).expect(200)).body.aiDataProcessingConsentAt).toBe(
      granted.body.aiDataProcessingConsentAt,
    );
    await draftNote(ctx).expect(201);
    await explain(ctx).expect(201);
    await narrate(ctx).expect(201);
    const consentLog = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: ctx.client.id, feature: 'draft_note' } });
    expect(consentLog.processingPolicy).toBe('client_consent');
    const interactionsBefore = await prisma.aiInteractionLog.count({ where: { clientId: ctx.client.id } });

    // 7–8. Revogação pelo próprio cliente, auditada.
    expect((await http().delete('/client/ai/consent').set(ctx.clientAuth).expect(200)).body).toEqual({ aiDataProcessingConsentAt: null });
    expect((await http().get('/client/ai/consent').set(ctx.clientAuth).expect(200)).body).toEqual({ aiDataProcessingConsentAt: null });
    expect(await prisma.aiAuditLog.count({ where: { clientId: ctx.client.id, action: 'consent_revoked_client' } })).toBe(1);

    // 9. Recursos protegidos voltam a bloquear.
    await draftNote(ctx).expect(403);
    await explain(ctx).expect(403);
    await narrate(ctx).expect(403);
    // 10. organize_workout continua funcionando.
    await organize(ctx).expect(201);

    // Revogar não apaga nada: interações anteriores, conta, cliente e dieta ficam.
    expect(await prisma.aiInteractionLog.count({ where: { clientId: ctx.client.id } })).toBe(interactionsBefore + 1);
    expect(await prisma.client.count({ where: { id: ctx.client.id } })).toBe(1);
    expect(await prisma.diet.count({ where: { clientId: ctx.client.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: ctx.client.id, anonymizedAt: null } })).toBe(1);

    // Revogar de novo não duplica auditoria; autorizar de novo registra nova data e nova auditoria.
    await http().delete('/client/ai/consent').set(ctx.clientAuth).expect(200);
    expect(await prisma.aiAuditLog.count({ where: { clientId: ctx.client.id, action: 'consent_revoked_client' } })).toBe(1);
    const regranted = await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    expect(new Date(regranted.body.aiDataProcessingConsentAt).getTime()).toBeGreaterThan(new Date(granted.body.aiDataProcessingConsentAt).getTime());
    expect(await prisma.aiAuditLog.count({ where: { clientId: ctx.client.id, action: 'consent_granted_client' } })).toBe(2);
  });

  it('exportação LGPD traz o estado do consentimento e os metadados das interações de IA (sem prompt/contexto/resposta)', async () => {
    const ctx = await setup();
    await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    await draftNote(ctx).expect(201);
    await organize(ctx).expect(201);

    const exported = (await http().post('/client/data-export').set(ctx.clientAuth).expect(201)).body;
    expect(exported.aiConsent.aiDataProcessingConsentAt).toEqual(expect.any(String));
    expect(exported.aiInteractions).toEqual([
      expect.objectContaining({ feature: 'draft_note', status: 'succeeded', processingPolicy: 'client_consent' }),
      expect.objectContaining({ feature: 'organize_workout', status: 'succeeded', processingPolicy: 'professional_material' }),
    ]);
    for (const interaction of exported.aiInteractions) {
      expect(Object.keys(interaction).sort()).toEqual(['createdAt', 'feature', 'model', 'processingPolicy', 'provider', 'status']);
    }
  });

  it('consentimento de uma cliente não afeta outra', async () => {
    const a = await setup();
    const b = await setup();
    await http().post('/client/ai/consent').set(a.clientAuth).expect(201);
    await draftNote(a).expect(201);
    await draftNote(b).expect(403);
    await http().delete('/client/ai/consent').set(a.clientAuth).expect(200);
    await http().post('/client/ai/consent').set(b.clientAuth).expect(201);
    await draftNote(a).expect(403);
    await draftNote(b).expect(201);
  });

  it('profissional não concede, consulta nem revoga o consentimento em nome da cliente', async () => {
    const ctx = await setup();
    await http().post('/client/ai/consent').set(ctx.proAuth).expect(403);
    await http().get('/client/ai/consent').set(ctx.proAuth).expect(403);
    await http().delete('/client/ai/consent').set(ctx.proAuth).expect(403);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: ctx.client.id } })).aiDataProcessingConsentAt).toBeNull();
    await draftNote(ctx).expect(403);
  });
});
