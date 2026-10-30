import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { dietReport, revisionRequest } from '../src/ai/use-cases/template-chat/diet-chat-report';
import { createFood, registerProfessional } from './helpers';

jest.setTimeout(30_000);
const prisma = new PrismaClient();

const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};
const reply = (body: unknown) => fakeProvider.generate.mockResolvedValueOnce({ text: JSON.stringify(body), model: 'fake-model' });
const foodRef = (id: string) => `P${id.replace(/-/g, '').slice(0, 8)}`;
const sentContext = (call: number) => fakeProvider.generate.mock.calls[call][0].context as Record<string, any>;

const day = (meals: unknown[]) => [{ label: null, kind: 'other', usageNotes: null, meals }];
const fixedMeal = (name: string, items: unknown[]) => ({ name, time: null, notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items }] }] });
const optionsMeal = (name: string, options: unknown[][]) => ({
  name,
  time: null,
  notes: null,
  groups: [{ kind: 'meal_options', label: null, choices: options.map((items, i) => ({ label: `Opção ${i + 1}`, items })) }],
});

describe('IA — dieta com metas e conferência do sistema (e2e)', () => {
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
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    await http().post('/professionals/me/ai/consent').set(auth).expect(201);
    const tag = Date.now().toString(36);
    // 160 kcal / 32 g P e 128 kcal / 28 g C por 100 g
    const frango = await createFood(app, professional.accessToken, { name: `Frango meta ${tag}`, scope: 'private', kcalPer100: 160, proteinGPer100: 32, carbGPer100: 0, fatGPer100: 2.5 });
    const arroz = await createFood(app, professional.accessToken, { name: `Arroz meta ${tag}`, scope: 'private', kcalPer100: 128, proteinGPer100: 2.5, carbGPer100: 28, fatGPer100: 0.2 });
    return { auth, frango: foodRef(frango.id), arroz: foodRef(arroz.id), frangoId: frango.id, arrozId: arroz.id };
  }
  const ask = (text: string, extra: Record<string, unknown> = {}) => ({ messages: [{ role: 'professional', text }], ...extra });
  const metas = { kcal: 600, proteinaG: 60, carboidratoG: 60, gorduraG: 6, calculo: 'Meta de teste: 600 kcal.' };

  it('dia longe da meta: o sistema manda a conta, a IA corrige numa 2ª rodada e fica a versão mais perto', async () => {
    const { auth, frango, arroz } = await setup();
    // 1ª rodada: 150 g arroz (192) + 100 g frango (160) = 352 kcal — 41% abaixo de 600.
    reply({ reply: 'Meta de 600 kcal para o teste.', changed: true, metas, days: day([fixedMeal('Almoço', [{ ref: arroz, quantity: 150, notes: null }, { ref: frango, quantity: 100, notes: null }])]), guidelines: [], warnings: [] });
    // 2ª rodada: 250 g arroz (320) + 175 g frango (280) = 600 kcal.
    reply({ reply: 'Aumentei arroz e frango.', changed: true, metas: null, days: day([fixedMeal('Almoço', [{ ref: arroz, quantity: 250, notes: null }, { ref: frango, quantity: 175, notes: null }])]), guidelines: [], warnings: [] });

    const res = await http().post('/templates/ai/diet').set(auth).send(ask('Monte um almoço de 600 kcal')).expect(201);
    const data = res.body.structuredData;

    expect(fakeProvider.generate).toHaveBeenCalledTimes(2);
    const second = sentContext(1);
    expect(second.pedido).toContain('[Conferência automática do sistema');
    expect(second.pedido).toContain('352 kcal');
    expect(second.analiseModeloAtual[0].totalPela1aOpcao.kcal).toBe(352);
    expect(second.conversa).toEqual([
      { quem: 'nutricionista', texto: 'Monte um almoço de 600 kcal' },
      { quem: 'assistente', texto: 'Meta de 600 kcal para o teste.' },
    ]);

    expect(data.revised).toBe(true);
    expect(data.reply).toBe('Meta de 600 kcal para o teste.\n\nConferi a soma pelo catálogo e ajustei as quantidades: Aumentei arroz e frango.');
    expect(data.targets).toEqual({ kcal: 600, proteinG: 60, carbG: 60, fatG: 6, calculation: 'Meta de teste: 600 kcal.' });
    expect(data.report[0].total).toEqual({ kcal: 600, proteinG: 62, carbG: 70, fatG: 5 });
    expect(data.report[0].meals[0]).toMatchObject({ name: 'Almoço', kcal: 600 });
    expect(data.warnings).toEqual([]);
    expect(data.content.days[0].meals[0].groups[0].choices[0].foods.map((f: { quantity: number }) => f.quantity)).toEqual([250, 175]);
  });

  it('dentro da meta: uma rodada só; opções muito diferentes da 1ª viram aviso', async () => {
    const { auth, frango, arroz } = await setup();
    // Opção 1 = 600 kcal; Opção 2 = 250 g arroz = 320 kcal (−47%).
    reply({
      reply: 'Duas opções de almoço.',
      changed: true,
      metas,
      days: day([optionsMeal('Almoço', [[{ ref: arroz, quantity: 250, notes: null }, { ref: frango, quantity: 175, notes: null }], [{ ref: arroz, quantity: 250, notes: null }]])]),
      guidelines: [],
      warnings: [],
    });
    const data = (await http().post('/templates/ai/diet').set(auth).send(ask('Almoço de 600 kcal com duas opções')).expect(201)).body.structuredData;
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
    expect(data.revised).toBe(false);
    expect(data.report[0].meals[0].options).toEqual([
      expect.objectContaining({ label: 'Opção 1', kcal: 600, diffPercent: 0 }),
      expect.objectContaining({ label: 'Opção 2', kcal: 320, diffPercent: -47 }),
    ]);
    expect(data.warnings).toEqual(['Almoço: Opção 2 com -47% de calorias em relação à 1ª opção.']);
  });

  it('se a correção falhar, fica a 1ª resposta com o aviso da meta', async () => {
    const { auth, frango, arroz } = await setup();
    reply({ reply: 'Meta de 600 kcal.', changed: true, metas, days: day([fixedMeal('Almoço', [{ ref: arroz, quantity: 150, notes: null }, { ref: frango, quantity: 100, notes: null }])]), guidelines: [], warnings: [] });
    fakeProvider.generate.mockRejectedValueOnce(new Error('falhou'));
    const data = (await http().post('/templates/ai/diet').set(auth).send(ask('Almoço de 600 kcal')).expect(201)).body.structuredData;
    expect(fakeProvider.generate).toHaveBeenCalledTimes(2);
    expect(data.revised).toBe(false);
    expect(data.report[0].total.kcal).toBe(352);
    expect(data.warnings).toContain('O dia ficou com 352 kcal, 41% abaixo da meta de 600 kcal — ajuste as quantidades no editor.');
  });

  it('só ajuste (sem metas): não confere meta nem chama de novo; a IA recebe a análise da dieta atual', async () => {
    const { auth, frango, arroz, frangoId, arrozId } = await setup();
    const current = {
      days: [{ label: null, kind: 'other', meals: [{ name: 'Almoço', groups: [{ kind: 'fixed', choices: [{ foods: [{ foodId: arrozId, quantity: 100, unit: 'g' }, { foodId: frangoId, quantity: 100, unit: 'g' }] }] }] }] }],
      supplements: [],
    };
    reply({ reply: 'Organizei o almoço.', changed: true, metas: null, days: day([fixedMeal('Almoço', [{ ref: frango, quantity: 100, notes: null }, { ref: arroz, quantity: 100, notes: null }])]), guidelines: [], warnings: [] });
    const data = (await http().post('/templates/ai/diet').set(auth).send(ask('Organize o almoço', { current })).expect(201)).body.structuredData;
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
    expect(sentContext(0).analiseModeloAtual).toEqual([
      { dia: null, refeicoes: [{ nome: 'Almoço', kcal: 288, proteina: 35, carboidrato: 28, gordura: 3 }], totalPela1aOpcao: { kcal: 288, proteina: 35, carboidrato: 28, gordura: 3 } },
    ]);
    expect(data.targets).toBeNull();
    expect(data.revised).toBe(false);
    expect(data.warnings).toEqual([]);
  });

  it('regras puras: dieta de vários dias ou sem meta não pede correção', () => {
    const foods = new Map([['a', { id: 'a', name: 'A', baseUnit: 'g', kcalPer100: 100, proteinGPer100: 10, carbGPer100: 10, fatGPer100: 2, fiberGPer100: 0 }]]) as never;
    const oneDay = { days: [{ meals: [{ name: 'M', groups: [{ kind: 'fixed', choices: [{ foods: [{ foodId: 'a', quantity: 100, unit: 'g' }] }] }] }] }] } as never;
    const report = dietReport(oneDay, foods);
    expect(report[0].total.kcal).toBe(100);
    expect(revisionRequest(report, null)).toBeNull();
    expect(revisionRequest(report, { kcal: 104, proteinG: null, carbG: null, fatG: null, calculation: null })).toBeNull();
    expect(revisionRequest(report, { kcal: 200, proteinG: null, carbG: null, fatG: null, calculation: null })).toContain('100 kcal');
    expect(revisionRequest([...report, ...report], { kcal: 200, proteinG: null, carbG: null, fatG: null, calculation: null })).toBeNull();
  });
});
