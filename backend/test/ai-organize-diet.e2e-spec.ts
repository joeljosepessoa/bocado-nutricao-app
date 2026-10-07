import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { ORGANIZED_DIET_JSON_SCHEMA } from '../src/ai/use-cases/organize-diet/organized-diet.schema';
import { createClient, createFood, registerProfessional } from './helpers';
import { faithfulUserDiet, USER_EXAMPLE_DIET, wholeLineUserDiet } from './fixtures/user-example-diet';

const prisma = new PrismaClient();

/**
 * Provedor falso controlado pelo teste, no lugar do mock local (mesmo id) —
 * o pipeline real (autorização, consentimento, conferência de fidelidade,
 * matching, logs) roda inteiro; só a resposta do "modelo" é roteirizada.
 */
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};

const reply = (body: unknown) =>
  fakeProvider.generate.mockResolvedValueOnce({ text: typeof body === 'string' ? body : JSON.stringify(body), model: 'fake-model' });

const item = (sourceText: string, food: string, quantity: number | null, unit: string | null) => ({
  sourceText,
  food,
  quantity,
  quantityMax: null,
  unit,
  freeQuantity: false,
  notes: null,
});
type Item = ReturnType<typeof item>;
const fixedMeal = (name: string, items: Item[]) => ({ name, time: null, notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items }] }] });
/** Resposta v2 com um único dia e refeições só com itens fixos. */
const v2 = (meals: ReturnType<typeof fixedMeal>[]) => ({ days: [{ label: null, kind: 'other', usageNotes: null, meals }], supplements: [], guidelines: [], warnings: [] });
const itemsOf = (proposal: { days: Array<{ meals: Array<{ groups: Array<{ choices: Array<{ items: unknown[] }> }> }> }> }) => proposal.days[0].meals[0].groups[0].choices[0].items as Array<Record<string, unknown>>;

describe('IA — organizar dieta existente (e2e)', () => {
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
    fakeProvider.supportsStructuredOutput = true;
  });

  async function setup({ professionalConsent = true } = {}) {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    if (professionalConsent) {
      await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${professional.accessToken}`).expect(201);
    }
    const tag = Date.now().toString(36);
    const bread = await createFood(app, professional.accessToken, { name: `Pão integral ${tag}`, scope: 'private' });
    return { professional, client, temporaryPassword, tag, bread };
  }

  const organize = (token: string, clientId: string, dietText: string) =>
    request(app.getHttpServer()).post(`/clients/${clientId}/ai/generate`).set('Authorization', `Bearer ${token}`).send({ feature: 'organize_diet', dietText });

  it('organiza sem alterar quantidades; gera só PROPOSTA (nenhuma dieta criada/publicada); log com política professional_material', async () => {
    const { professional, client, tag, bread } = await setup();
    const text = `CAFÉ DA MANHÃ\n2 fatias de Pão integral ${tag}\n150 g de fruta`;
    reply(v2([fixedMeal('CAFÉ DA MANHÃ', [item(`2 fatias de Pão integral ${tag}`, `Pão integral ${tag}`, 2, 'fatias'), item('150 g de fruta', 'fruta', 150, 'g')])]));

    const res = await organize(professional.accessToken, client.id, text).expect(201);
    const proposal = res.body.structuredData;
    expect(proposal.days).toHaveLength(1);
    expect(proposal.days[0].meals).toHaveLength(1);
    const items = itemsOf(proposal);
    expect(items.map((i) => [i.quantity, i.unit])).toEqual([
      [2, 'slice'],
      [150, 'g'],
    ]);
    expect(items[0]).toMatchObject({ matchStatus: 'matched', matchedFood: { id: bread.id } });
    expect(items[1]).toMatchObject({ matchStatus: 'not_found', matchedFood: null });
    expect((items[1].warnings as string[])[0]).toMatch(/não identificado/);

    // Contexto mínimo e saída estruturada com o schema da dieta.
    const sent = fakeProvider.generate.mock.calls[0][0];
    expect(sent.context).toEqual({ dietText: text });
    expect(sent.responseSchema).toEqual(ORGANIZED_DIET_JSON_SCHEMA);
    expect(JSON.stringify(sent)).not.toContain(client.user.fullName);

    expect(await prisma.diet.count({ where: { clientId: client.id } })).toBe(0);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log).toMatchObject({ status: 'succeeded', processingPolicy: 'professional_material', promptVersion: 'organize_diet@v2.1' });
  });

  it.each([
    ['quantidade alterada', item('150 g de fruta', 'fruta', 200, 'g'), /quantidade 200/],
    ['alimento trocado', item('150 g de fruta', 'banana', 150, 'g'), /alimento "banana"/],
    ['alimento inventado', item('1 colher de azeite', 'azeite', 1, 'colher de sopa'), /não está no texto/],
  ])('%s: resposta recusada (invalid_output), nada devolvido', async (_label, fruitItem, message) => {
    const { professional, client } = await setup();
    reply(v2([fixedMeal('ALMOÇO', [fruitItem])]));
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
    expect(res.body.message).toMatch(message);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log.status).toBe('invalid_output');
  });

  it('refeição acrescentada pela IA é recusada; alimento omitido vira aviso de revisão', async () => {
    const { professional, client } = await setup();
    reply(v2([fixedMeal('ALMOÇO', [item('150 g de fruta', 'fruta', 150, 'g')]), fixedMeal('CEIA', [item('150 g de fruta', 'fruta', 150, 'g')])]));
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);

    reply(v2([fixedMeal('ALMOÇO', [item('150 g de fruta', 'fruta', 150, 'g')])]));
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta\n100 g de feijão').expect(201);
    expect(res.body.structuredData.warnings).toEqual(['Trecho não organizado: "100 g de feijão" — revisar.']);
  });

  it('v2: a dieta real (treino/descanso, opções, blocos, suplementos, orientações) vira proposta estruturada, sem avisos', async () => {
    const { professional, client } = await setup();
    reply(faithfulUserDiet());
    const res = await organize(professional.accessToken, client.id, USER_EXAMPLE_DIET).expect(201);
    const proposal = res.body.structuredData;
    expect(proposal.warnings).toEqual([]);
    expect(proposal.days.map((d: { label: string; kind: string }) => [d.label, d.kind])).toEqual([
      ['DIA DE TREINO', 'training'],
      ['DIA DE DESCANSO', 'rest'],
    ]);
    const cafe = proposal.days[0].meals[0];
    expect(cafe.groups[0].kind).toBe('meal_options');
    expect(cafe.groups[0].choices.map((c: { label: string }) => c.label)).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
    const salad = proposal.days[0].meals[1].groups[2].choices[0].items[2];
    expect(salad).toMatchObject({ rawFood: 'salada de folhas', freeQuantity: true, quantity: null });
    expect(proposal.supplements.map((s: { name: string }) => s.name)).toEqual(['Creatina', 'Ômega-3', 'Whey protein']);
    expect(proposal.guidelines).toHaveLength(8);
    // Nada gravado: é só proposta.
    expect(await prisma.diet.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('v2: regressão do falso positivo — linha inteira em cada item e "2 ovos" no café e no lanche são aceitos', async () => {
    const { professional, client } = await setup();
    reply(wholeLineUserDiet());
    await organize(professional.accessToken, client.id, USER_EXAMPLE_DIET).expect(201);
  });

  it('v2: opções misturadas ou alternativa virando item fixo são recusadas (invalid_output)', async () => {
    const { professional, client } = await setup();
    const mixed = faithfulUserDiet();
    const [op1, op2] = mixed.days[0].meals[0].groups[0].choices;
    op1.items.push(op2.items.pop()!);
    reply(mixed);
    const res = await organize(professional.accessToken, client.id, USER_EXAMPLE_DIET).expect(503);
    expect(res.body.message).toMatch(/opções misturadas/);

    const merged = faithfulUserDiet();
    const almoco = merged.days[0].meals[1];
    const carbo = almoco.groups.shift()!;
    almoco.groups[1].choices[0].items.push(...carbo.choices[0].items, ...carbo.choices[1].items);
    reply(merged);
    expect((await organize(professional.accessToken, client.id, USER_EXAMPLE_DIET).expect(503)).body.message).toMatch(/são alternativas no texto/);
  });

  it('resposta que não é JSON é recusada', async () => {
    const { professional, client } = await setup();
    reply('Claro! Sua dieta está ótima.');
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
  });

  it('consentimento: sem o do profissional → 403 e provedor nunca chamado; o da cliente não é exigido', async () => {
    const { professional, client } = await setup({ professionalConsent: false });
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(403);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('a cliente não pode pedir organize_diet pelo app', async () => {
    const { client, temporaryPassword } = await setup();
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ feature: 'organize_diet', dietText: 'ALMOÇO\n150 g de fruta' })
      .expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('provedor sem saída estruturada (mock local): erro claro, provedor não chamado, log "failed"', async () => {
    const { professional, client } = await setup();
    fakeProvider.supportsStructuredOutput = false;
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
    expect(res.body.message).toMatch(/AI_PROVIDER=anthropic/);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log.status).toBe('failed');
  });

  it('texto vazio é recusado na validação', async () => {
    const { professional, client } = await setup();
    await organize(professional.accessToken, client.id, '   ').expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });
});
