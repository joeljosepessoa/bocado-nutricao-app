import { AiOutputValidationError } from '../../ai-errors';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { FoodsService } from '../../../foods/foods.service';
import { catalogRefs, CreateDietUseCase, type CalculableFood, type CreatedDietProposal } from './create-diet.use-case';
import { CREATED_DIET_JSON_SCHEMA, parseCreatedDiet } from './created-diet.schema';

const food = (over: Partial<CalculableFood>): CalculableFood => ({
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Alimento',
  baseUnit: 'g',
  sourceKey: null,
  sourceNumber: null,
  foodGroup: null,
  kcalPer100: 100,
  proteinGPer100: 10,
  carbGPer100: 10,
  fatGPer100: 1,
  fiberGPer100: null,
  ...over,
});
const ARROZ = food({ id: 'a-arroz', name: 'Arroz, tipo 1, cozido', sourceKey: 'taco4:3', sourceNumber: 3, foodGroup: 'Cereais e derivados', kcalPer100: 128.25848566666664, proteinGPer100: 2.5, carbGPer100: 28.1, fatGPer100: 0.2, fiberGPer100: 1.6 });
const BATATA = food({ id: 'a-batata', name: 'Batata, inglesa, cozida', sourceKey: 'taco4:91', sourceNumber: 91, kcalPer100: 51.6, proteinGPer100: 1.2, carbGPer100: 11.9, fatGPer100: 0 });
const FRANGO = food({ id: 'a-frango', name: 'Frango, peito, sem pele, grelhado', sourceKey: 'taco4:410', sourceNumber: 410, kcalPer100: 159.2, proteinGPer100: 32, carbGPer100: 0, fatGPer100: 2.5 });
const PRIVADO = food({ id: 'abcdef12-0000-0000-0000-000000000000', name: 'Iogurte da casa', baseUnit: 'ml', kcalPer100: 60 });

const foodsService = { listCalculableForAi: jest.fn().mockResolvedValue([ARROZ, BATATA, FRANGO, PRIVADO]) };
const prisma = {
  client: { findUniqueOrThrow: jest.fn().mockResolvedValue({ birthDate: new Date('1990-06-15T00:00:00Z'), gender: 'Feminino' }) },
  physicalEvaluation: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'ev1',
      evaluatedAt: new Date('2026-09-01T12:00:00Z'),
      ageAtEvaluation: 36,
      biologicalSexForCalculation: 'female',
      heightCm: 165,
      weightKg: 70.04,
      calculatedMetrics: { bodyFatPercent: 28.26, leanMassKg: 50.2 },
      bioimpedance: null,
    }),
  },
};
const useCase = new CreateDietUseCase(prisma as unknown as PrismaService, foodsService as unknown as FoodsService);
const params = (over: Record<string, unknown> = {}) => ({
  professionalId: 'p1',
  clientId: 'c1',
  input: { feature: 'create_diet', dietGoal: 'Emagrecimento, sem lactose, 3 refeições', targetKcal: 600, ...over },
});
const item = (ref: string, quantity: number, notes: string | null = null) => ({ ref, quantity, notes });
const aiJson = (choicesAlmoco: unknown[], extra: Record<string, unknown> = {}) => ({
  days: [
    {
      label: null,
      kind: 'other',
      usageNotes: null,
      meals: [
        { name: 'Almoço', time: '12:00', notes: null, groups: [{ kind: 'alternatives', label: 'Carboidrato', choices: choicesAlmoco }, { kind: 'fixed', label: null, choices: [{ label: null, items: [item('T410', 150)] }] }] },
      ],
    },
  ],
  guidelines: ['Beba água ao longo do dia.'],
  warnings: [],
  ...extra,
});
const run = async (json: unknown, over: Record<string, unknown> = {}) =>
  (await useCase.processOutput({ text: JSON.stringify(json), model: 'x' }, params(over))).structuredData as unknown as CreatedDietProposal;

describe('CreateDietUseCase — modo "Deixar a IA montar"', () => {
  it('referência estável: nº da TACO ("T410") ou começo do id para alimento do profissional', () => {
    expect([...catalogRefs([ARROZ, FRANGO, PRIVADO]).keys()]).toEqual(['T3', 'T410', 'Pabcdef12']);
  });

  it('contexto: pedido do profissional + paciente MINIMIZADO (sem nome/observações/pressão) + catálogo calculável', async () => {
    const ctx = await useCase.buildContext(params({ mealsPerDay: 3 }));
    expect(Object.keys(ctx.context)).toEqual(['pedidoDoProfissional', 'paciente', 'catalogo']);
    expect(ctx.context.pedidoDoProfissional).toEqual({ texto: 'Emagrecimento, sem lactose, 3 refeições', metaKcal: 600, refeicoesPorDia: 3 });
    expect(ctx.context.paciente).toEqual({
      idadeAnos: expect.any(Number),
      sexo: 'feminino',
      ultimaAvaliacao: { data: '2026-09-01', pesoKg: 70, alturaCm: 165, gorduraCorporalPercent: 28.3, massaMagraKg: 50.2, taxaMetabolicaBasalKcal: null },
    });
    const sent = JSON.stringify(ctx.context);
    for (const forbidden of ['ev1', 'c1', 'p1', 'Feminino"', 'notes', 'pressao', 'glicose']) expect(sent).not.toContain(forbidden);
    expect(ctx.contextRef).toBe('ev1');
    expect(ctx.context.catalogo).toEqual([
      { ref: 'T3', nome: 'Arroz, tipo 1, cozido', unidade: 'g', grupo: 'Cereais e derivados', kcal: 128.3, proteina: 2.5, carboidrato: 28.1, lipideos: 0.2 },
      expect.objectContaining({ ref: 'T91' }),
      expect.objectContaining({ ref: 'T410' }),
      expect.objectContaining({ ref: 'Pabcdef12', unidade: 'ml' }),
    ]);
    expect(ctx.systemPrompt).toMatch(/EXCLUSIVAMENTE alimentos da lista "catalogo"/);
    expect(useCase.responseSchema).toBe(CREATED_DIET_JSON_SCHEMA);
  });

  it('sem avaliação: paciente só com idade/sexo do cadastro; sem catálogo calculável → erro antes de chamar a IA', async () => {
    prisma.physicalEvaluation.findFirst.mockResolvedValueOnce(null);
    const ctx = await useCase.buildContext(params());
    expect(ctx.context.paciente).toEqual({ idadeAnos: expect.any(Number), sexo: 'feminino', ultimaAvaliacao: null });
    expect(ctx.contextRef).toBeUndefined();
    foodsService.listCalculableForAi.mockResolvedValueOnce([]);
    await expect(useCase.buildContext(params())).rejects.toThrow(/catálogo ainda não tem alimentos/);
  });

  it('proposta: itens ligados ao catálogo (nome oficial, g/ml), sistema calcula — "escolher 1" vira faixa, nunca soma', async () => {
    const proposal = await run(aiJson([{ label: null, items: [item('T3', 100)] }, { label: null, items: [item('T91', 200)] }]));
    expect(proposal.mode).toBe('create');
    const [carbo, fixo] = proposal.days[0].meals[0].groups;
    expect(carbo.choices.map((c) => c.items[0])).toEqual([
      expect.objectContaining({ rawFood: 'Arroz, tipo 1, cozido', matchStatus: 'matched', matchedFood: { id: 'a-arroz', name: 'Arroz, tipo 1, cozido' }, quantity: 100, unit: 'g', sourceText: '' }),
      expect.objectContaining({ rawFood: 'Batata, inglesa, cozida', quantity: 200 }),
    ]);
    expect(fixo.choices[0].items[0]).toMatchObject({ matchedFood: { id: 'a-frango' }, quantity: 150 });
    // Frango 150 g = 238,8 kcal; arroz 100 g = 128,3 ou batata 200 g = 103,2 → 342,0–367,1 kcal.
    expect(proposal.nutrition).toEqual({
      targetKcal: 600,
      days: [{ label: null, min: expect.objectContaining({ kcal: 342, proteinG: 50.4 }), max: expect.objectContaining({ kcal: 367.1 }) }],
    });
    expect(proposal.days[0].warnings).toEqual([
      'Total calculado pelo sistema (342–367 kcal) fora da meta de 600 kcal (±10%) — ajuste as quantidades antes de criar.',
    ]);
    expect(proposal.guidelines).toEqual(['Beba água ao longo do dia.']);
    expect(proposal.supplements).toEqual([]);
  });

  it('dentro de ±10% da meta não gera aviso; sem meta, nunca gera', async () => {
    const proposal = await run(aiJson([{ label: null, items: [item('T3', 100)] }]), { targetKcal: 380 });
    expect(proposal.days[0].warnings).toEqual([]);
    expect((await run(aiJson([{ label: null, items: [item('T3', 100)] }]), { targetKcal: undefined })).days[0].warnings).toEqual([]);
  });

  it('referência fora do catálogo é DESCARTADA com aviso (nada inventado); sem nenhum item válido → erro', async () => {
    const proposal = await run(aiJson([{ label: null, items: [item('T3', 100), item('T9999', 50)] }]), { targetKcal: undefined });
    expect(proposal.days[0].meals[0].groups[0].choices[0].items).toHaveLength(1);
    expect(proposal.days[0].meals[0].warnings).toEqual(['A IA indicou um alimento que não está no catálogo ("T9999") — o item foi descartado.']);
    const onlyInvented = { ...aiJson([]), days: [{ label: null, kind: 'other', usageNotes: null, meals: [{ name: 'Almoço', time: null, notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items: [item('X1', 10)] }] }] }] }] };
    await expect(run(onlyInvented)).rejects.toThrow(AiOutputValidationError);
  });

  it('valida a saída: quantidade fora de 1–2000, campo desconhecido, nome livre de alimento e JSON inválido são recusados', () => {
    const bad = (items: unknown[]) => JSON.stringify(aiJson([{ label: null, items }]));
    expect(() => parseCreatedDiet(bad([item('T3', 0)]))).toThrow(/quantity/);
    expect(() => parseCreatedDiet(bad([item('T3', 2500)]))).toThrow(/quantity/);
    expect(() => parseCreatedDiet(bad([{ ...item('T3', 100), food: 'Arroz inventado' }]))).toThrow(/campo desconhecido/);
    expect(() => parseCreatedDiet(JSON.stringify({ ...aiJson([]), supplements: [] }))).toThrow(/campo desconhecido/);
    expect(() => parseCreatedDiet('não é json')).toThrow(AiOutputValidationError);
  });

  it('resposta truncada não vira proposta pela metade', async () => {
    await expect(useCase.processOutput({ text: '{"days":[', model: 'x', truncated: true }, params())).rejects.toThrow(/longa demais/);
  });
});
