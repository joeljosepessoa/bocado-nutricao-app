import type { DietClientChoice, DietClientDay, DietClientFoodItem, DietClientGroup, DietClientSummary, NutritionRange } from '../../types/api';
import {
  choiceTitle,
  dayTitle,
  dietDays,
  foodStatus,
  formatKcal,
  formatMacros,
  groupTitle,
  isRange,
  mealSummary,
  quantityText,
  showDayTabs,
  supplementQuantityText,
} from '../dietView';

const range = (min: number, max = min, partial = false): NutritionRange => ({
  min: { kcal: min, proteinG: min / 20, carbG: min / 10, fatG: min / 40, fiberG: 0 },
  max: { kcal: max, proteinG: max / 20, carbG: max / 10, fatG: max / 40, fiberG: 0 },
  partial,
});

const food = (foodName: string, quantity: number | null, unit: string | null, kcal: number | null, extra: Partial<DietClientFoodItem> = {}): DietClientFoodItem => ({
  foodName,
  isCustom: false,
  quantity,
  quantityMax: null,
  isFreeQuantity: false,
  unit,
  kcal,
  proteinG: kcal === null ? null : 1,
  carbG: kcal === null ? null : 1,
  fatG: kcal === null ? null : 1,
  substitutions: [],
  ...extra,
});

const choice = (label: string | null, foods: DietClientFoodItem[], nutrition: NutritionRange, order = 0): DietClientChoice => ({ label, order, nutrition, foods });
const group = (kind: DietClientGroup['kind'], label: string | null, choices: DietClientChoice[], nutrition: NutritionRange, order = 0): DietClientGroup => ({
  kind,
  label,
  order,
  nutrition,
  choices,
});

/** Como a API envia a dieta do exemplo do profissional (resumida). */
function structuredDiet(): DietClientSummary {
  const training: DietClientDay = {
    label: 'DIA DE TREINO',
    kind: 'training',
    usageNotes: 'Usar nos 5 dias de musculação na semana.',
    order: 0,
    nutrition: range(760, 846, true),
    meals: [
      {
        name: 'ALMOÇO',
        order: 1,
        time: null,
        notes: null,
        nutrition: range(440, 496, true),
        groups: [
          group('fixed', null, [choice(null, [food('salada de folhas', null, null, null, { isCustom: true, isFreeQuantity: true }), food('Feijão', 50, 'g', 38)], range(38, 38, true))], range(38, 38, true), 2),
          group('alternatives', 'Carboidrato', [choice(null, [food('Arroz', 65, 'g', 85)], range(85)), choice(null, [food('Batata inglesa', 160, 'g', 141)], range(141), 1)], range(85, 141)),
          group(
            'alternatives',
            'Proteína',
            [choice(null, [food('Peito de frango', 135, 'g', 220), food('Azeite', 10, 'g', 88)], range(308)), choice(null, [food('Carne magra', 160, 'g', 250), food('Azeite', 8, 'g', 71)], range(321), 1)],
            range(308, 321),
            1,
          ),
        ],
      },
      {
        name: 'CAFÉ DA MANHÃ',
        order: 0,
        time: '07:00',
        notes: null,
        nutrition: range(320, 350),
        groups: [
          group(
            'meal_options',
            null,
            [choice('Opção 1', [food('Aveia', 10, 'g', 39), food('Ovo', 2, 'unit', 156)], range(350)), choice('Opção 2', [food('Whey', 30, 'g', 120)], range(320), 1), choice('Opção 3', [food('Pão integral', 2, 'slice', 140)], range(340), 2)],
            range(320, 350),
          ),
        ],
      },
    ],
  };
  const rest: DietClientDay = {
    label: 'DIA DE DESCANSO',
    kind: 'rest',
    usageNotes: null,
    order: 1,
    nutrition: range(98),
    meals: [{ name: 'CEIA', order: 0, time: null, notes: null, nutrition: range(98), groups: [group('fixed', null, [choice(null, [food('Castanhas', 15, 'g', 98)], range(98))], range(98))] }],
  };
  return {
    dietId: 'd1',
    versionId: 'v1',
    meals: [{ name: 'formato antigo', order: 0, time: null, notes: null, foods: [] }],
    days: [rest, training],
    supplements: [
      { name: 'Ômega-3', quantity: 1, quantityMax: null, unitText: 'cápsula', timing: 'Almoço e jantar', notes: null, order: 1 },
      { name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: 'Antes do café da manhã', notes: null, order: 0 },
    ],
    patientGuidelines: 'Água: no mínimo 2,5 litros por dia.',
  };
}

describe('dieta do paciente — estrutura nova', () => {
  it('usa os dias da API em ordem (dia, refeição, bloco, escolha) e mostra o seletor de dia', () => {
    const days = dietDays(structuredDiet());
    expect(days.map((d, i) => dayTitle(d, i))).toEqual(['DIA DE TREINO', 'DIA DE DESCANSO']);
    expect(showDayTabs(days)).toBe(true);
    const [cafe, almoco] = days[0].meals;
    expect([cafe.name, almoco.name]).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO']);
    expect(almoco.groups.map(groupTitle)).toEqual(['Carboidrato', 'Proteína', 'Itens fixos']);
    expect(cafe.groups[0].choices.map((c, i) => choiceTitle(c.label, i))).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
  });

  it('opções e alternativas aparecem como faixa vinda da API — nunca a soma (1010 kcal)', () => {
    const cafe = dietDays(structuredDiet())[0].meals[0];
    expect(cafe.groups[0].choices.map((c) => formatKcal(c.nutrition!))).toEqual(['350 kcal', '320 kcal', '340 kcal']);
    expect(formatKcal(cafe.groups[0].nutrition!)).toBe('320–350 kcal');
    expect(isRange(cafe.nutrition!)).toBe(true);
    expect(formatKcal(cafe.nutrition!)).not.toContain('1010');
  });

  it('alternativa com dois alimentos fica junta, com um total só', () => {
    const proteina = dietDays(structuredDiet())[0].meals[1].groups[1];
    expect(proteina.choices[0].foods.map((f) => f.foodName)).toEqual(['Peito de frango', 'Azeite']);
    expect(formatKcal(proteina.choices[0].nutrition!)).toBe('308 kcal');
  });

  it('dias diferentes nunca são somados', () => {
    const [training, rest] = dietDays(structuredDiet());
    expect(formatKcal(training.nutrition!)).toBe('760–846 kcal');
    expect(formatKcal(rest.nutrition!)).toBe('98 kcal');
  });

  it('item à vontade ou fora do catálogo não ganha kcal inventado', () => {
    const fixed = dietDays(structuredDiet())[0].meals[1].groups[2].choices[0].foods;
    expect(foodStatus(fixed[0])).toBe('À vontade');
    expect(quantityText(fixed[0])).toBe('à vontade');
    expect(foodStatus(food('Molho caseiro', 1, null, null, { isCustom: true }))).toBe('Sem cálculo');
    expect(foodStatus(fixed[1])).toBeNull();
  });

  it('início conta refeições por tipo de dia (opções não viram refeições)', () => {
    expect(mealSummary(structuredDiet())).toBe('DIA DE TREINO: 2 refeições · DIA DE DESCANSO: 1 refeição');
  });

  it('suplementos: "3–5 g" e "1 cápsula"', () => {
    const [omega, creatina] = structuredDiet().supplements!;
    expect(supplementQuantityText(creatina)).toBe('3–5 g');
    expect(supplementQuantityText(omega)).toBe('1 cápsula');
  });
});

describe('formatação', () => {
  it('quantidade em pt-BR com unidade traduzida e faixa', () => {
    expect(quantityText(food('Pão', 2, 'slice', 140))).toBe('2 fatia(s)');
    expect(quantityText(food('Aveia', 1.5, 'tablespoon', 50))).toBe('1,5 colher(es) de sopa');
    expect(quantityText(food('Creatina', 3, 'g', 0, { quantityMax: 5 }))).toBe('3–5 g');
    expect(quantityText(food('Salada', null, null, null))).toBe('');
  });

  it('kcal sem casas e com milhar; macros com uma casa', () => {
    expect(formatKcal(range(1800, 2050.4))).toBe('1.800–2.050 kcal');
    expect(formatMacros(range(100))).toBe('P 5g · C 10g · G 2,5g');
  });
});

describe('compatibilidade com dietas antigas', () => {
  const legacy: DietClientSummary = {
    dietId: 'd1',
    versionId: 'v1',
    meals: [
      { name: 'Jantar', order: 1, time: null, notes: null, foods: [{ foodName: 'Frango', quantity: 150, unit: 'g', kcal: 248, proteinG: 46, carbG: 0, fatG: 5, substitutions: [] }] },
      { name: 'Almoço', order: 0, time: '12:00', notes: 'Mastigar devagar', foods: [{ foodName: 'Arroz', quantity: 100, unit: 'g', kcal: 130, proteinG: 2.7, carbG: 28, fatG: 0.3, substitutions: [] }] },
    ],
  };

  it('dieta convertida pelo P1 (dia único sem nome, só itens fixos) não mostra seletor de dia', () => {
    const converted: DietClientSummary = {
      ...legacy,
      days: [{ label: null, kind: 'other', usageNotes: null, order: 0, nutrition: range(130), meals: [{ name: 'Almoço', order: 0, time: '12:00', notes: null, nutrition: range(130), groups: [group('fixed', null, [choice(null, [food('Arroz', 100, 'g', 130)], range(130))], range(130))] }] }],
    };
    const days = dietDays(converted);
    expect(showDayTabs(days)).toBe(false);
    expect(mealSummary(converted)).toBe('1 refeição prescrita.');
  });

  it('API anterior à estrutura nova (só "meals"): vira um dia único com itens fixos, na ordem, como antes', () => {
    const days = dietDays(legacy);
    expect(days).toHaveLength(1);
    expect(showDayTabs(days)).toBe(false);
    expect(days[0].meals.map((m) => [m.name, m.time, m.notes])).toEqual([
      ['Almoço', '12:00', 'Mastigar devagar'],
      ['Jantar', null, null],
    ]);
    const arroz = days[0].meals[0].groups[0].choices[0].foods[0];
    expect([arroz.foodName, quantityText(arroz), foodStatus(arroz)]).toEqual(['Arroz', '100 g', null]);
    expect(days[0].meals[0].nutrition).toBeNull();
    expect(mealSummary(legacy)).toBe('2 refeições prescritas.');
  });
});
