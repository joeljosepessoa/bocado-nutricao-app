import type {
  Diet,
  DietChoiceNode,
  DietDayNode,
  DietGroupNode,
  DietMealNode,
  DietSupplement,
  DietVersion,
  MealFood,
  NutritionRange,
} from '../../types/api';

/**
 * Respostas da API no formato do P1. A nutrição é escrita À MÃO, como o
 * backend devolve — a tela só exibe (nunca soma opções/alternativas).
 */

export const range = (min: number, max = min, partial = false): NutritionRange => ({
  min: { kcal: min, proteinG: min / 20, carbG: min / 10, fatG: min / 40, fiberG: 0 },
  max: { kcal: max, proteinG: max / 20, carbG: max / 10, fatG: max / 40, fiberG: 0 },
  partial,
});

let seq = 0;
export function item(name: string, quantity: number | null, unit: string | null, kcal: number | null, extra: Partial<MealFood> = {}): MealFood {
  seq += 1;
  return {
    id: `mf-${seq}`,
    foodId: `food-${name}`,
    quantity,
    unit,
    kcal,
    proteinG: kcal === null ? null : 1,
    carbG: kcal === null ? null : 1,
    fatG: kcal === null ? null : 1,
    food: { name },
    ...extra,
  };
}

export const custom = (name: string, extra: Partial<MealFood> = {}): MealFood =>
  item(name, null, null, null, { foodId: null, customFoodName: name, food: null, ...extra });

export const choice = (id: string, label: string | null, foods: MealFood[], nutrition: NutritionRange): DietChoiceNode => ({ id, label, order: 0, foods, nutrition });

export function group(id: string, kind: DietGroupNode['kind'], label: string | null, choices: DietChoiceNode[], nutrition: NutritionRange): DietGroupNode {
  return { id, kind, label, order: 0, choices: choices.map((c, i) => ({ ...c, order: i })), nutrition };
}

export const fixed = (id: string, foods: MealFood[], nutrition: NutritionRange) => group(id, 'fixed', null, [choice(`${id}-c`, null, foods, nutrition)], nutrition);

export function meal(id: string, name: string, groups: DietGroupNode[], nutrition: NutritionRange, extra: Partial<DietMealNode> = {}): DietMealNode {
  return { id, name, order: 0, time: null, notes: null, groups: groups.map((g, i) => ({ ...g, order: i })), nutrition, ...extra };
}

export function day(id: string, label: string | null, kind: DietDayNode['kind'], meals: DietMealNode[], nutrition: NutritionRange): DietDayNode {
  return { id, label, kind, usageNotes: null, order: 0, meals: meals.map((m, i) => ({ ...m, order: i })), nutrition };
}

export function version(
  status: DietVersion['status'],
  days: DietDayNode[],
  extra: { supplements?: DietSupplement[]; patientGuidelines?: string | null; notes?: string | null; id?: string; versionNumber?: number } = {},
): DietVersion {
  return {
    id: extra.id ?? (status === 'draft' ? 'v-draft' : 'v-pub'),
    dietId: 'd1',
    versionNumber: extra.versionNumber ?? 1,
    status,
    startDate: null,
    endDate: null,
    notes: extra.notes ?? null,
    objective: null,
    targetCalories: null,
    targetProteinG: null,
    targetCarbG: null,
    targetFatG: null,
    publishedAt: status === 'published' ? '2026-10-01T00:00:00.000Z' : null,
    supersededAt: null,
    meals: [],
    patientGuidelines: extra.patientGuidelines ?? null,
    days,
    supplements: extra.supplements ?? [],
  };
}

export function dietWith(current: DietVersion): Diet {
  return {
    id: 'd1',
    clientId: 'c1',
    status: 'active',
    versions: [{ id: current.id, versionNumber: current.versionNumber, status: current.status, publishedAt: current.publishedAt, supersededAt: null, createdAt: '2026-10-01' }],
    currentVersion: current,
  };
}

// --- Cenários -------------------------------------------------------------------

/** Dieta antiga convertida pelo P1: dia único sem nome → refeição → grupo fixo → escolha única. */
export function legacyDays(): DietDayNode[] {
  return [
    day(
      'day-1',
      null,
      'other',
      [
        meal('m-cafe', 'Café da manhã', [fixed('g-cafe', [item('Pão integral', 2, 'slice', 140), item('Ovo', 2, 'unit', 156)], range(296))], range(296), { time: '07:00' }),
        meal('m-almoco', 'Almoço', [fixed('g-almoco', [item('Arroz', 150, 'g', 195), item('Frango', 100, 'g', 165)], range(360))], range(360)),
      ],
      range(656),
    ),
  ];
}

/** A dieta de exemplo do usuário: dia de treino e de descanso, opções, blocos, à vontade, sem catálogo. */
export function structuredDays(): DietDayNode[] {
  const cafe = meal(
    'm-cafe',
    'Café da manhã',
    [
      group(
        'g-opcoes',
        'meal_options',
        null,
        [
          choice('op-1', 'Opção 1', [item('Aveia', 10, 'g', 39), item('Banana', 110, 'g', 98), item('Ovo', 2, 'unit', 156), item('Clara', 3, 'unit', 57)], range(350)),
          choice('op-2', 'Opção 2', [item('Aveia', 20, 'g', 78), item('Fruta', 120, 'g', 120), item('Whey', 30, 'g', 122)], range(320)),
          choice('op-3', 'Opção 3', [item('Pão integral', 2, 'slice', 140), item('Ovo', 2, 'unit', 156), item('Clara', 2, 'unit', 44)], range(340)),
        ],
        range(320, 350),
      ),
    ],
    range(320, 350),
  );
  const almoco = meal(
    'm-almoco',
    'Almoço',
    [
      group(
        'g-carbo',
        'alternatives',
        'Carboidrato',
        [
          choice('alt-arroz', null, [item('Arroz', 65, 'g', 85)], range(85)),
          choice('alt-batata', null, [item('Batata', 160, 'g', 120)], range(120)),
        ],
        range(85, 120),
      ),
      group(
        'g-prot',
        'alternatives',
        'Proteína',
        [
          choice('alt-frango', null, [item('Frango', 135, 'g', 220), item('Azeite', 10, 'g', 88)], range(308)),
          choice('alt-carne', null, [item('Carne magra', 160, 'g', 250), item('Azeite', 8, 'g', 71)], range(321)),
        ],
        range(308, 321),
      ),
      fixed('g-fixo-almoco', [custom('Salada de folhas', { isFreeQuantity: true }), custom('Molho caseiro')], range(0, 0, true)),
    ],
    range(393, 441, true),
  );
  const ceiaTreino = meal('m-ceia-t', 'Ceia', [fixed('g-ceia-t', [item('Iogurte', 170, 'g', 120)], range(120))], range(120));
  const ceiaDescanso = meal('m-ceia-d', 'Ceia', [fixed('g-ceia-d', [item('Castanhas', 15, 'g', 98)], range(98))], range(98));
  return [
    day('day-treino', 'Dia de treino', 'training', [cafe, almoco, ceiaTreino], range(833, 911, true)),
    { ...day('day-descanso', 'Dia de descanso', 'rest', [ceiaDescanso], range(98)), order: 1 },
  ];
}

export const supplements: DietSupplement[] = [
  { id: 's-creatina', name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: 'Antes do café da manhã', notes: null, order: 0 },
  { id: 's-omega', name: 'Ômega-3', quantity: 1, quantityMax: null, unitText: 'cápsula', timing: 'Almoço + jantar', notes: null, order: 1 },
];
