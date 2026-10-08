import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { CLIENT_AI_CONSENT_MISSING_MESSAGE } from '../src/ai/ai.service';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { CREATED_DIET_JSON_SCHEMA } from '../src/ai/use-cases/create-diet/created-diet.schema';
import { createClient, createFood, registerProfessional } from './helpers';

jest.setTimeout(30_000);
const prisma = new PrismaClient();

/** Provedor roteirizado no lugar do mock local (mesmo id): consentimento, política, conferência e logs são os reais. */
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};
const reply = (body: unknown) => fakeProvider.generate.mockResolvedValueOnce({ text: JSON.stringify(body), model: 'fake-model' });
const refOf = (foodId: string) => `P${foodId.replace(/-/g, '').slice(0, 8)}`;

describe('IA — montar dieta com o catálogo (create_diet, e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MockAiProvider).useValue(fakeProvider).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => fakeProvider.generate.mockReset());

  async function setup() {
    const professional = await registerProfessional(app);
    const proAuth = { Authorization: `Bearer ${professional.accessToken}` };
    await http().post('/professionals/me/ai/consent').set(proAuth).expect(201);
    const fullName = `Paciente Sigilosa ${Date.now()}`;
    const { client, temporaryPassword } = await createClient(app, professional.accessToken, { fullName, gender: 'female', birthDate: '1990-06-15' });
    const login = await http().post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const tag = Date.now().toString(36);
    const frango = await createFood(app, professional.accessToken, { name: `Frango teste ${tag}`, scope: 'private', kcalPer100: 160, proteinGPer100: 32, carbGPer100: 0, fatGPer100: 2.5 });
    const arroz = await createFood(app, professional.accessToken, { name: `Arroz teste ${tag}`, scope: 'private', kcalPer100: 128, proteinGPer100: 2.5, carbGPer100: 28, fatGPer100: 0.2 });
    return { proAuth, clientAuth: { Authorization: `Bearer ${login.body.accessToken}` }, client, fullName, frango, arroz };
  }

  const create = (auth: Record<string, string>, clientId: string, body: Record<string, unknown>) =>
    http().post(`/clients/${clientId}/ai/generate`).set(auth).send({ feature: 'create_diet', ...body });

  it('sem o consentimento do paciente: bloqueia antes de chamar a IA (dado do cliente exige consentimento)', async () => {
    const ctx = await setup();
    const res = await create(ctx.proAuth, ctx.client.id, { dietGoal: 'Emagrecimento' }).expect(403);
    expect(res.body.message).toBe(CLIENT_AI_CONSENT_MISSING_MESSAGE);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
    expect(await prisma.aiAuditLog.count({ where: { clientId: ctx.client.id, feature: 'create_diet', action: 'generation_blocked' } })).toBe(1);
  });

  it('com consentimento: PROPOSTA só com alimentos do catálogo, calculada pelo sistema; contexto sem nome/e-mail; nada gravado em dieta', async () => {
    const ctx = await setup();
    await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    reply({
      days: [
        {
          label: null,
          kind: 'other',
          usageNotes: null,
          meals: [
            {
              name: 'Almoço',
              time: '12:00',
              notes: null,
              groups: [
                { kind: 'fixed', label: null, choices: [{ label: null, items: [{ ref: refOf(ctx.frango.id), quantity: 150, notes: null }, { ref: 'INVENTADO', quantity: 30, notes: null }] }] },
                { kind: 'alternatives', label: 'Carboidrato', choices: [{ label: null, items: [{ ref: refOf(ctx.arroz.id), quantity: 100, notes: 'cozido' }] }] },
              ],
            },
          ],
        },
      ],
      guidelines: ['Beba água ao longo do dia.'],
      warnings: ['Meta estimada em 1800 kcal a partir do pedido.'],
    });

    const res = await create(ctx.proAuth, ctx.client.id, { dietGoal: 'Hipertrofia, almoço às 12h', targetKcal: 1000, mealsPerDay: 1 }).expect(201);
    const proposal = res.body.structuredData;
    expect(proposal.mode).toBe('create');
    const [fixo, carbo] = proposal.days[0].meals[0].groups;
    expect(fixo.choices[0].items).toEqual([
      expect.objectContaining({ rawFood: ctx.frango.name, matchStatus: 'matched', matchedFood: { id: ctx.frango.id, name: ctx.frango.name }, quantity: 150, unit: 'g' }),
    ]);
    expect(carbo.choices[0].items[0]).toMatchObject({ matchedFood: { id: ctx.arroz.id }, quantity: 100, notes: 'cozido' });
    expect(proposal.days[0].meals[0].warnings).toEqual(['A IA indicou um alimento que não está no catálogo ("INVENTADO") — o item foi descartado.']);
    // Sistema: frango 150 g = 240 kcal + arroz 100 g = 128 kcal → 368 kcal — longe da meta de 1.000 → aviso no dia.
    expect(proposal.nutrition).toEqual({ targetKcal: 1000, days: [{ label: null, min: expect.objectContaining({ kcal: 368, proteinG: 50.5 }), max: expect.objectContaining({ kcal: 368 }) }] });
    expect(proposal.days[0].warnings).toEqual(['Total calculado pelo sistema (368 kcal) fora da meta de 1.000 kcal (±10%) — ajuste as quantidades antes de criar.']);
    expect(proposal.warnings).toEqual(['Meta estimada em 1800 kcal a partir do pedido.']);

    // O que foi enviado ao provedor: pedido + paciente minimizado + catálogo com os alimentos do profissional.
    const sent = fakeProvider.generate.mock.calls[0][0];
    expect(sent.responseSchema).toEqual(CREATED_DIET_JSON_SCHEMA);
    expect(sent.context.pedidoDoProfissional).toEqual({ texto: 'Hipertrofia, almoço às 12h', metaKcal: 1000, refeicoesPorDia: 1 });
    expect(sent.context.paciente).toEqual({ idadeAnos: expect.any(Number), sexo: 'feminino', ultimaAvaliacao: null });
    expect(sent.context.catalogo).toEqual(expect.arrayContaining([expect.objectContaining({ ref: refOf(ctx.frango.id), nome: ctx.frango.name, kcal: 160 })]));
    const serialized = JSON.stringify(sent);
    for (const secret of [ctx.fullName, ctx.client.user.email, ctx.client.id]) expect(serialized).not.toContain(secret);

    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: ctx.client.id, feature: 'create_diet' } });
    expect(log).toMatchObject({ status: 'succeeded', processingPolicy: 'client_consent', promptVersion: 'create_diet@v1' });
    expect(await prisma.diet.count({ where: { clientId: ctx.client.id } })).toBe(0);
  });

  it('validação do pedido: texto obrigatório; meta de kcal e nº de refeições dentro dos limites', async () => {
    const ctx = await setup();
    await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    await create(ctx.proAuth, ctx.client.id, {}).expect(400);
    await create(ctx.proAuth, ctx.client.id, { dietGoal: '   ' }).expect(400);
    await create(ctx.proAuth, ctx.client.id, { dietGoal: 'ok', targetKcal: 100 }).expect(400);
    await create(ctx.proAuth, ctx.client.id, { dietGoal: 'ok', mealsPerDay: 12 }).expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('o próprio cliente não pode pedir create_diet (ferramenta só do profissional)', async () => {
    const ctx = await setup();
    await http().post('/client/ai/consent').set(ctx.clientAuth).expect(201);
    await http().post('/client/ai/generate').set(ctx.clientAuth).send({ feature: 'create_diet', dietGoal: 'x' }).expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });
});
