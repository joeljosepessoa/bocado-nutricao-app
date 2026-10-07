import type {
  CatalogFoodRef,
  CreateDietFromProposalInput,
  DietDayKind,
  FoodMatchStatus,
  MealGroupKind,
  NutritionUnit,
  OrganizedDietProposal,
  ProposalChoiceFoodInput,
  ProposalDietItem,
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

/** `manual` = escolhido no catálogo na revisão; `custom` = usado como nome livre (sem cálculo). */
export type DraftFoodMatch = FoodMatchStatus | 'manual' | 'custom';

export interface DraftFood {
  key: string;
  /** Trecho do texto original de onde a IA tirou o item — null quando adicionado à mão. */
  sourceText: string | null;
  rawFood: string | null;
  food: CatalogFoodRef | null;
  /** Nome livre (fora do catálogo, sem cálculo) — alternativa a `food`. */
  customName: string | null;
  match: DraftFoodMatch;
  candidates: CatalogFoodRef[];
  quantity: number | null;
  quantityMax: number | null;
  freeQuantity: boolean;
  unit: NutritionUnit | null;
  notes: string;
  /** Observações da conferência que não viram aviso "vivo" — o profissional marca como revisadas. */
  notices: string[];
}

export interface DraftChoice {
  key: string;
  label: string;
  foods: DraftFood[];
}

export interface DraftGroup {
  key: string;
  kind: MealGroupKind;
  label: string;
  choices: DraftChoice[];
}

export interface DraftMeal {
  key: string;
  name: string;
  time: string;
  notes: string;
  groups: DraftGroup[];
  notices: string[];
}

export interface DraftDay {
  key: string;
  label: string;
  kind: DietDayKind;
  usageNotes: string;
  meals: DraftMeal[];
  notices: string[];
}

export interface DraftSupplement {
  key: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string;
  timing: string;
  notes: string;
  notices: string[];
}

export interface DietDraft {
  days: DraftDay[];
  supplements: DraftSupplement[];
  /** Orientações ao paciente (texto livre, uma por linha). */
  guidelines: string;
  /** Avisos gerais (ex.: trecho do texto que a IA não organizou) — precisam ser revisados antes de criar. */
  notices: string[];
}

/**
 * Recalculados a cada edição (somem quando o profissional corrige o dado).
 * Os textos equivalentes vindos do backend não são repetidos como observação.
 */
export const LIVE_WARNINGS = {
  foodNotSelected: 'Escolha o alimento no catálogo ou use como nome livre.',
  customNameBlank: 'Informe o nome do alimento.',
  quantityMissing: 'Informe a quantidade (ou marque "à vontade").',
  unitMissing: 'Escolha a unidade.',
  rangeInvalid: 'A quantidade máxima não pode ser menor que a mínima.',
  mealNameBlank: 'Informe o nome da refeição.',
  timeInvalid: 'Horário deve estar no formato HH:mm.',
  noChoices: 'Bloco "escolha 1" sem nenhuma opção.',
  choiceEmpty: 'Opção sem alimentos.',
  mealEmpty: 'Refeição sem alimentos.',
  supplementNameBlank: 'Informe o nome do suplemento.',
} as const;

const COVERED_BY_LIVE = [
  /^Alimento não identificado no catálogo/,
  /^Alimento com mais de uma correspondência/,
  /^Quantidade não informada/,
  /^Unidade ".*" não existe no sistema/,
  /^Refeição sem título no texto/,
  /^Nenhum alimento identificado nesta refeição/,
];

const isLiveDuplicate = (warning: string) => COVERED_BY_LIVE.some((pattern) => pattern.test(warning));

let counter = 0;
const nextKey = (prefix: string) => `${prefix}-${++counter}`;

function itemToFood(item: ProposalDietItem): DraftFood {
  return {
    key: nextKey('food'),
    sourceText: item.sourceText,
    rawFood: item.rawFood,
    food: item.matchedFood,
    customName: null,
    match: item.matchStatus,
    candidates: item.candidates,
    quantity: item.freeQuantity ? null : item.quantity,
    quantityMax: item.freeQuantity ? null : item.quantityMax,
    freeQuantity: item.freeQuantity,
    unit: item.freeQuantity ? null : item.unit,
    notes: item.notes ?? '',
    notices: item.warnings.filter((w) => !isLiveDuplicate(w)),
  };
}

export function proposalToDraft(proposal: OrganizedDietProposal): DietDraft {
  return {
    notices: [...proposal.warnings],
    guidelines: proposal.guidelines.join('\n'),
    supplements: proposal.supplements.map((s) => ({
      key: nextKey('supplement'),
      name: s.name,
      quantity: s.quantity,
      quantityMax: s.quantityMax,
      unitText: s.unitText ?? '',
      timing: s.timing ?? '',
      notes: s.notes ?? '',
      notices: [...s.warnings],
    })),
    days: proposal.days.map((day) => ({
      key: nextKey('day'),
      label: day.label ?? '',
      kind: day.kind,
      usageNotes: day.usageNotes ?? '',
      notices: [...day.warnings],
      meals: day.meals.map((meal) => ({
        key: nextKey('meal'),
        name: meal.name ?? '',
        time: meal.time ?? '',
        notes: meal.notes ?? '',
        notices: meal.warnings.filter((w) => !isLiveDuplicate(w)),
        groups: meal.groups.map((group) => ({
          key: nextKey('group'),
          kind: group.kind,
          label: group.label ?? '',
          choices: group.choices.map((choice) => ({ key: nextKey('choice'), label: choice.label ?? '', foods: choice.items.map(itemToFood) })),
        })),
      })),
    })),
  };
}

export function manualFood(food: CatalogFoodRef): DraftFood {
  return {
    key: nextKey('food'),
    sourceText: null,
    rawFood: null,
    food,
    customName: null,
    match: 'manual',
    candidates: [],
    quantity: null,
    quantityMax: null,
    freeQuantity: false,
    unit: null,
    notes: '',
    notices: [],
  };
}

export function emptyMeal(): DraftMeal {
  return { key: nextKey('meal'), name: '', time: '', notes: '', groups: [emptyGroup('fixed')], notices: [] };
}

export function emptyGroup(kind: MealGroupKind, label = ''): DraftGroup {
  return { key: nextKey('group'), kind, label, choices: kind === 'fixed' ? [emptyChoice()] : [] };
}

export function emptyChoice(label = ''): DraftChoice {
  return { key: nextKey('choice'), label, foods: [] };
}

export function emptySupplement(): DraftSupplement {
  return { key: nextKey('supplement'), name: '', quantity: null, quantityMax: null, unitText: '', timing: '', notes: '', notices: [] };
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function foodDisplayName(food: DraftFood): string {
  return food.food?.name ?? food.customName ?? food.rawFood ?? 'Alimento';
}

export function foodWarnings(food: DraftFood): string[] {
  const warnings: string[] = [];
  if (!food.food && food.customName === null) warnings.push(LIVE_WARNINGS.foodNotSelected);
  if (!food.food && food.customName !== null && !food.customName.trim()) warnings.push(LIVE_WARNINGS.customNameBlank);
  if (food.freeQuantity) return warnings;
  // Item do catálogo precisa de quantidade e unidade para o sistema calcular; nome livre não tem cálculo.
  if (food.food && (food.quantity === null || !(food.quantity > 0))) warnings.push(LIVE_WARNINGS.quantityMissing);
  if (food.food && !food.unit) warnings.push(LIVE_WARNINGS.unitMissing);
  if (food.quantityMax !== null && (food.quantity === null || food.quantityMax < food.quantity)) warnings.push(LIVE_WARNINGS.rangeInvalid);
  return warnings;
}

export function mealWarnings(meal: DraftMeal): string[] {
  const warnings: string[] = [];
  if (!meal.name.trim()) warnings.push(LIVE_WARNINGS.mealNameBlank);
  if (meal.time && !TIME_PATTERN.test(meal.time)) warnings.push(LIVE_WARNINGS.timeInvalid);
  if (meal.groups.every((g) => g.choices.every((c) => c.foods.length === 0))) warnings.push(LIVE_WARNINGS.mealEmpty);
  return warnings;
}

export function groupWarnings(group: DraftGroup): string[] {
  if (group.kind !== 'fixed' && group.choices.length === 0) return [LIVE_WARNINGS.noChoices];
  return [];
}

export function choiceWarnings(group: DraftGroup, choice: DraftChoice): string[] {
  return group.kind !== 'fixed' && choice.foods.length === 0 ? [LIVE_WARNINGS.choiceEmpty] : [];
}

/** Tudo que impede criar o rascunho — nada é completado automaticamente. */
export function draftProblems(draft: DietDraft): string[] {
  const problems: string[] = [];
  const meals = draft.days.flatMap((d) => d.meals);
  if (meals.length === 0) problems.push('Inclua ao menos uma refeição.');
  const notices = draft.notices.length + draft.days.reduce((sum, d) => sum + d.notices.length, 0);
  if (notices > 0) problems.push(`Revise ${notices} aviso(s) geral(is) da organização (ex.: trecho não organizado) antes de criar.`);
  const multiDay = draft.days.length > 1 || draft.days.some((d) => d.label.trim());
  draft.days.forEach((day, d) => {
    const dayLabel = multiDay ? `${day.label.trim() || `Dia ${d + 1}`} · ` : '';
    day.meals.forEach((meal, m) => {
      const label = `${dayLabel}Refeição ${m + 1}${meal.name.trim() ? ` (${meal.name.trim()})` : ''}`;
      mealWarnings(meal).forEach((w) => problems.push(`${label}: ${w}`));
      for (const group of meal.groups) {
        groupWarnings(group).forEach((w) => problems.push(`${label}${group.label ? ` — ${group.label}` : ''}: ${w}`));
        group.choices.forEach((choice, c) => {
          choiceWarnings(group, choice).forEach((w) => problems.push(`${label}, ${choice.label || `opção ${c + 1}`}: ${w}`));
          choice.foods.forEach((food) => foodWarnings(food).forEach((w) => problems.push(`${label}, ${foodDisplayName(food)}: ${w}`)));
        });
      }
    });
  });
  draft.supplements.forEach((s, i) => {
    if (!s.name.trim()) problems.push(`Suplemento ${i + 1}: ${LIVE_WARNINGS.supplementNameBlank}`);
    if (s.quantityMax !== null && (s.quantity === null || s.quantityMax < s.quantity)) problems.push(`Suplemento ${s.name || i + 1}: ${LIVE_WARNINGS.rangeInvalid}`);
  });
  return problems;
}

const text = (value: string) => value.trim() || null;

function foodPayload(food: DraftFood): ProposalChoiceFoodInput {
  const base: ProposalChoiceFoodInput = food.food ? { foodId: food.food.id } : { customFoodName: food.customName!.trim() };
  const notes = text(food.notes);
  if (food.freeQuantity) return { ...base, isFreeQuantity: true, notes };
  return {
    ...base,
    ...(food.quantity !== null ? { quantity: food.quantity } : {}),
    ...(food.quantityMax !== null ? { quantityMax: food.quantityMax } : {}),
    ...(food.unit ? { unit: food.unit } : {}),
    notes,
  };
}

/** Só o que o profissional revisou — vira RASCUNHO, nunca publica. */
export function draftToPayload(draft: DietDraft, replaceDraft = false): CreateDietFromProposalInput {
  return {
    ...(replaceDraft ? { replaceDraft: true } : {}),
    days: draft.days.map((day) => ({
      label: text(day.label),
      kind: day.kind,
      usageNotes: text(day.usageNotes),
      meals: day.meals.map((meal) => ({
        name: meal.name.trim(),
        time: text(meal.time),
        notes: text(meal.notes),
        groups: meal.groups.map((group) => ({
          kind: group.kind,
          label: text(group.label),
          choices: group.choices.map((choice) => ({ label: text(choice.label), foods: choice.foods.map(foodPayload) })),
        })),
      })),
    })),
    supplements: draft.supplements.map((s) => ({
      name: s.name.trim(),
      ...(s.quantity !== null ? { quantity: s.quantity } : {}),
      ...(s.quantityMax !== null ? { quantityMax: s.quantityMax } : {}),
      unitText: text(s.unitText),
      timing: text(s.timing),
      notes: text(s.notes),
    })),
    patientGuidelines: text(draft.guidelines),
  };
}

// --- Edição imutável por chave (as chaves são únicas no rascunho inteiro) -------

const mapMeals = (draft: DietDraft, fn: (meal: DraftMeal) => DraftMeal): DietDraft => ({
  ...draft,
  days: draft.days.map((day) => ({ ...day, meals: day.meals.map(fn) })),
});
const mapGroups = (draft: DietDraft, fn: (group: DraftGroup) => DraftGroup) => mapMeals(draft, (meal) => ({ ...meal, groups: meal.groups.map(fn) }));
const mapChoices = (draft: DietDraft, fn: (choice: DraftChoice) => DraftChoice) => mapGroups(draft, (group) => ({ ...group, choices: group.choices.map(fn) }));

export function updateDay(draft: DietDraft, dayKey: string, fn: (day: DraftDay) => DraftDay): DietDraft {
  return { ...draft, days: draft.days.map((day) => (day.key === dayKey ? fn(day) : day)) };
}

export function updateMeal(draft: DietDraft, mealKey: string, fn: (meal: DraftMeal) => DraftMeal): DietDraft {
  return mapMeals(draft, (meal) => (meal.key === mealKey ? fn(meal) : meal));
}

export function updateGroup(draft: DietDraft, groupKey: string, fn: (group: DraftGroup) => DraftGroup): DietDraft {
  return mapGroups(draft, (group) => (group.key === groupKey ? fn(group) : group));
}

export function updateChoice(draft: DietDraft, choiceKey: string, fn: (choice: DraftChoice) => DraftChoice): DietDraft {
  return mapChoices(draft, (choice) => (choice.key === choiceKey ? fn(choice) : choice));
}

export function updateFood(draft: DietDraft, foodKey: string, fn: (food: DraftFood) => DraftFood): DietDraft {
  return mapChoices(draft, (choice) => ({ ...choice, foods: choice.foods.map((food) => (food.key === foodKey ? fn(food) : food)) }));
}

export function updateSupplement(draft: DietDraft, key: string, fn: (s: DraftSupplement) => DraftSupplement): DietDraft {
  return { ...draft, supplements: draft.supplements.map((s) => (s.key === key ? fn(s) : s)) };
}

export function selectFood(food: DraftFood, chosen: CatalogFoodRef): DraftFood {
  return { ...food, food: chosen, customName: null, match: 'manual' };
}

/** Usa o nome escrito como item fora do catálogo ("Sem cálculo"). */
export function asCustomName(food: DraftFood): DraftFood {
  return { ...food, food: null, customName: food.customName ?? food.rawFood ?? '', match: 'custom' };
}

export function removeFood(draft: DietDraft, foodKey: string): DietDraft {
  return mapChoices(draft, (choice) => ({ ...choice, foods: choice.foods.filter((food) => food.key !== foodKey) }));
}

export function removeChoice(draft: DietDraft, choiceKey: string): DietDraft {
  return mapGroups(draft, (group) => ({ ...group, choices: group.choices.filter((choice) => choice.key !== choiceKey) }));
}

export function removeGroup(draft: DietDraft, groupKey: string): DietDraft {
  return mapMeals(draft, (meal) => ({ ...meal, groups: meal.groups.filter((group) => group.key !== groupKey) }));
}

export function removeMeal(draft: DietDraft, mealKey: string): DietDraft {
  return { ...draft, days: draft.days.map((day) => ({ ...day, meals: day.meals.filter((meal) => meal.key !== mealKey) })) };
}

export function removeSupplement(draft: DietDraft, key: string): DietDraft {
  return { ...draft, supplements: draft.supplements.filter((s) => s.key !== key) };
}

export function moveMeal(draft: DietDraft, mealKey: string, direction: -1 | 1): DietDraft {
  return {
    ...draft,
    days: draft.days.map((day) => {
      const index = day.meals.findIndex((meal) => meal.key === mealKey);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= day.meals.length) return day;
      const meals = [...day.meals];
      [meals[index], meals[target]] = [meals[target], meals[index]];
      return { ...day, meals };
    }),
  };
}

export function withoutNotice(notices: string[], notice: string): string[] {
  return notices.filter((n) => n !== notice);
}
