import type {
  CatalogFoodRef,
  CreateDietFromProposalInput,
  FoodMatchStatus,
  NutritionUnit,
  OrganizedDietProposal,
} from '../types/api';

export const UNIT_LABELS: Record<NutritionUnit, string> = {
  g: 'g',
  ml: 'ml',
  unit: 'unidade(s)',
  tablespoon: 'colher(es) de sopa',
  teaspoon: 'colher(es) de chá',
  cup: 'xícara(s)',
  slice: 'fatia(s)',
};
export const UNITS = Object.keys(UNIT_LABELS) as NutritionUnit[];

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as NutritionUnit] ?? unit;
}

/** `manual` = escolhido/adicionado pelo profissional na revisão. */
export type DraftFoodMatch = FoodMatchStatus | 'manual';

export interface DraftFood {
  key: string;
  /** Trecho do texto original de onde a IA tirou o item — null quando adicionado à mão. */
  sourceText: string | null;
  rawFood: string | null;
  food: CatalogFoodRef | null;
  match: DraftFoodMatch;
  candidates: CatalogFoodRef[];
  quantity: number | null;
  unit: NutritionUnit | null;
  notes: string;
  /** Observações da conferência que não viram aviso "vivo" — o profissional marca como revisadas. */
  notices: string[];
}

export interface DraftMeal {
  key: string;
  name: string;
  time: string;
  notes: string;
  foods: DraftFood[];
  notices: string[];
}

export interface DietDraft {
  meals: DraftMeal[];
  /** Avisos gerais (ex.: trecho do texto que a IA não organizou) — precisam ser revisados antes de criar. */
  notices: string[];
}

/**
 * Recalculados a cada edição (somem quando o profissional corrige o dado).
 * Os textos equivalentes vindos do backend não são repetidos como observação.
 */
export const LIVE_WARNINGS = {
  foodNotSelected: 'Escolha o alimento no catálogo.',
  quantityMissing: 'Informe a quantidade.',
  unitMissing: 'Escolha a unidade.',
  mealNameBlank: 'Informe o nome da refeição.',
  timeInvalid: 'Horário deve estar no formato HH:mm.',
} as const;

const COVERED_BY_LIVE = [
  /^Alimento não identificado no catálogo/,
  /^Alimento com mais de uma correspondência/,
  /^Quantidade não informada/,
  /^Unidade ".*" não existe no sistema/,
  /^Refeição sem título no texto/,
];

const isLiveDuplicate = (warning: string) => COVERED_BY_LIVE.some((pattern) => pattern.test(warning));

let counter = 0;
const nextKey = (prefix: string) => `${prefix}-${++counter}`;

export function proposalToDraft(proposal: OrganizedDietProposal): DietDraft {
  return {
    notices: [...proposal.warnings],
    meals: proposal.meals.map((meal) => ({
      key: nextKey('meal'),
      name: meal.name ?? '',
      time: meal.time ?? '',
      notes: meal.notes ?? '',
      notices: meal.warnings.filter((w) => !isLiveDuplicate(w)),
      foods: meal.items.map((item) => ({
        key: nextKey('food'),
        sourceText: item.sourceText,
        rawFood: item.rawFood,
        food: item.matchedFood,
        match: item.matchStatus,
        candidates: item.candidates,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes ?? '',
        notices: item.warnings.filter((w) => !isLiveDuplicate(w)),
      })),
    })),
  };
}

export function manualFood(food: CatalogFoodRef): DraftFood {
  return { key: nextKey('food'), sourceText: null, rawFood: null, food, match: 'manual', candidates: [], quantity: null, unit: null, notes: '', notices: [] };
}

export function emptyMeal(): DraftMeal {
  return { key: nextKey('meal'), name: '', time: '', notes: '', foods: [], notices: [] };
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function foodWarnings(food: DraftFood): string[] {
  const warnings: string[] = [];
  if (!food.food) warnings.push(LIVE_WARNINGS.foodNotSelected);
  if (food.quantity === null || !(food.quantity > 0)) warnings.push(LIVE_WARNINGS.quantityMissing);
  if (!food.unit) warnings.push(LIVE_WARNINGS.unitMissing);
  return warnings;
}

export function mealWarnings(meal: DraftMeal): string[] {
  const warnings: string[] = [];
  if (!meal.name.trim()) warnings.push(LIVE_WARNINGS.mealNameBlank);
  if (meal.time && !TIME_PATTERN.test(meal.time)) warnings.push(LIVE_WARNINGS.timeInvalid);
  return warnings;
}

/** Tudo que impede criar o rascunho — nada é completado automaticamente. */
export function draftProblems(draft: DietDraft): string[] {
  const problems: string[] = [];
  if (draft.meals.length === 0) problems.push('Inclua ao menos uma refeição.');
  if (draft.notices.length > 0) {
    problems.push(`Revise ${draft.notices.length} aviso(s) geral(is) da organização (ex.: trecho não organizado) antes de criar.`);
  }
  draft.meals.forEach((meal, m) => {
    const label = `Refeição ${m + 1}${meal.name.trim() ? ` (${meal.name.trim()})` : ''}`;
    mealWarnings(meal).forEach((w) => problems.push(`${label}: ${w}`));
    meal.foods.forEach((food, f) => {
      const foodLabel = food.food?.name ?? food.rawFood ?? `alimento ${f + 1}`;
      foodWarnings(food).forEach((w) => problems.push(`${label}, ${foodLabel}: ${w}`));
    });
  });
  return problems;
}

export function draftToPayload(draft: DietDraft, replaceDraft = false): CreateDietFromProposalInput {
  return {
    ...(replaceDraft ? { replaceDraft: true } : {}),
    meals: draft.meals.map((meal) => ({
      name: meal.name.trim(),
      time: meal.time.trim() || null,
      notes: meal.notes.trim() || null,
      foods: meal.foods.map((food) => ({
        foodId: food.food!.id,
        quantity: food.quantity!,
        unit: food.unit!,
        notes: food.notes.trim() || null,
      })),
    })),
  };
}

export function updateMeal(draft: DietDraft, mealKey: string, fn: (meal: DraftMeal) => DraftMeal): DietDraft {
  return { ...draft, meals: draft.meals.map((meal) => (meal.key === mealKey ? fn(meal) : meal)) };
}

export function updateFood(draft: DietDraft, mealKey: string, foodKey: string, fn: (food: DraftFood) => DraftFood): DietDraft {
  return updateMeal(draft, mealKey, (meal) => ({ ...meal, foods: meal.foods.map((food) => (food.key === foodKey ? fn(food) : food)) }));
}

export function selectFood(food: DraftFood, chosen: CatalogFoodRef): DraftFood {
  return { ...food, food: chosen, match: 'manual' };
}

export function removeFood(draft: DietDraft, mealKey: string, foodKey: string): DietDraft {
  return updateMeal(draft, mealKey, (meal) => ({ ...meal, foods: meal.foods.filter((food) => food.key !== foodKey) }));
}

export function removeMeal(draft: DietDraft, mealKey: string): DietDraft {
  return { ...draft, meals: draft.meals.filter((meal) => meal.key !== mealKey) };
}

export function moveMeal(draft: DietDraft, mealKey: string, direction: -1 | 1): DietDraft {
  const index = draft.meals.findIndex((meal) => meal.key === mealKey);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.meals.length) return draft;
  const meals = [...draft.meals];
  [meals[index], meals[target]] = [meals[target], meals[index]];
  return { ...draft, meals };
}

export function withoutNotice(notices: string[], notice: string): string[] {
  return notices.filter((n) => n !== notice);
}
