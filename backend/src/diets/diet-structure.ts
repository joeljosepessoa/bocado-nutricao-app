import { DietDayKind, MealGroupKind } from '@prisma/client';

/**
 * Estrutura da dieta (P1): DietVersion → DietDay → Meal → MealGroup →
 * MealChoice → MealFood. Funções PURAS: montam a árvore a partir das linhas
 * do banco e calculam a nutrição em FAIXA — opções/alternativas nunca são
 * somadas entre si e dias diferentes nunca são somados. Tolera dado ainda
 * não convertido (refeição sem dia, item sem escolha): ele entra no dia
 * único / grupo fixo da refeição, exatamente como era lido antes.
 */

// --- Linhas como vêm do Prisma (só o que a montagem usa) -------------------

export interface FoodRow {
  id: string;
  mealId: string;
  mealChoiceId: string | null;
  foodId: string | null;
  customFoodName: string | null;
  order: number;
  quantity: number | null;
  quantityMax: number | null;
  isFreeQuantity: boolean;
  unit: string | null;
  gramsEquivalent: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
  notes: string | null;
  food: { id: string; name: string; baseUnit?: string } | null;
}

export interface ChoiceRow {
  id: string;
  mealGroupId: string;
  label: string | null;
  order: number;
}

export interface GroupRow {
  id: string;
  mealId: string;
  kind: MealGroupKind;
  label: string | null;
  order: number;
  choices: ChoiceRow[];
}

export interface MealRow {
  id: string;
  dietDayId: string | null;
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  foods: FoodRow[];
  groups: GroupRow[];
}

export interface DayRow {
  id: string;
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  order: number;
}

// --- Nutrição em faixa --------------------------------------------------------

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
}

/**
 * min/max: menor e maior combinação possível. `partial`: algum item ficou de
 * fora da soma (à vontade, fora do catálogo, sem quantidade ou sem conversão
 * confiável) — o total é PARCIAL.
 */
export interface NutritionRange {
  min: Nutrients;
  max: Nutrients;
  partial: boolean;
}

const KEYS: (keyof Nutrients)[] = ['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'];
const zero = (): Nutrients => ({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 });
const emptyRange = (): NutritionRange => ({ min: zero(), max: zero(), partial: false });

function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG, fiberG: a.fiberG + b.fiberG };
}

/** Soma (itens/grupos consumidos juntos). */
export function sumRanges(ranges: NutritionRange[]): NutritionRange {
  return ranges.reduce(
    (acc, r) => ({ min: addNutrients(acc.min, r.min), max: addNutrients(acc.max, r.max), partial: acc.partial || r.partial }),
    emptyRange(),
  );
}

/** "Escolher 1": nunca soma — faixa entre a menor e a maior escolha, nutriente a nutriente. */
export function chooseOneRange(ranges: NutritionRange[]): NutritionRange {
  if (ranges.length === 0) return emptyRange();
  const min = zero();
  const max = zero();
  for (const key of KEYS) {
    min[key] = Math.min(...ranges.map((r) => r.min[key]));
    max[key] = Math.max(...ranges.map((r) => r.max[key]));
  }
  return { min, max, partial: ranges.some((r) => r.partial) };
}

/** Item sem cálculo (à vontade, fora do catálogo, sem quantidade, sem conversão) fica fora da soma. */
export function isCalculable(food: Pick<FoodRow, 'isFreeQuantity' | 'foodId' | 'quantity' | 'kcal'>): boolean {
  return !food.isFreeQuantity && food.foodId !== null && food.quantity !== null && food.kcal !== null;
}

export function itemRange(food: FoodRow): NutritionRange {
  if (!isCalculable(food)) return { ...emptyRange(), partial: true };
  const min: Nutrients = {
    kcal: food.kcal ?? 0,
    proteinG: food.proteinG ?? 0,
    carbG: food.carbG ?? 0,
    fatG: food.fatG ?? 0,
    fiberG: food.fiberG ?? 0,
  };
  // Faixa de quantidade ("3 a 5 g"): o valor gravado é o da quantidade mínima; o máximo é proporcional.
  const factor = food.quantityMax !== null && food.quantity! > 0 ? food.quantityMax / food.quantity! : 1;
  const max = { ...min };
  for (const key of KEYS) max[key] = min[key] * factor;
  return { min, max, partial: false };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function roundRange(range: NutritionRange): NutritionRange {
  const r = (n: Nutrients): Nutrients => ({
    kcal: round(n.kcal),
    proteinG: round(n.proteinG),
    carbG: round(n.carbG),
    fatG: round(n.fatG),
    fiberG: round(n.fiberG),
  });
  return { min: r(range.min), max: r(range.max), partial: range.partial };
}

// --- Árvore -------------------------------------------------------------------

export interface ChoiceNode {
  id: string | null;
  label: string | null;
  order: number;
  foods: FoodRow[];
  nutrition: NutritionRange;
}

export interface GroupNode {
  id: string | null;
  kind: MealGroupKind;
  label: string | null;
  order: number;
  choices: ChoiceNode[];
  nutrition: NutritionRange;
}

export interface MealNode {
  id: string;
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  groups: GroupNode[];
  nutrition: NutritionRange;
}

export interface DayNode {
  id: string | null;
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  order: number;
  meals: MealNode[];
  /** Faixa do DIA — dias diferentes nunca são somados entre si. */
  nutrition: NutritionRange;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function groupRange(kind: MealGroupKind, choices: ChoiceNode[]): NutritionRange {
  const ranges = choices.map((c) => c.nutrition);
  return kind === MealGroupKind.fixed ? sumRanges(ranges) : chooseOneRange(ranges);
}

function buildMeal(meal: MealRow): MealNode {
  const groups = [...meal.groups].sort(byOrder);
  const choiceIds = new Set(groups.flatMap((g) => g.choices.map((c) => c.id)));
  const foodsByChoice = new Map<string, FoodRow[]>();
  const orphans: FoodRow[] = [];
  for (const food of meal.foods) {
    if (food.mealChoiceId && choiceIds.has(food.mealChoiceId)) {
      foodsByChoice.set(food.mealChoiceId, [...(foodsByChoice.get(food.mealChoiceId) ?? []), food]);
    } else {
      orphans.push(food);
    }
  }

  const nodes: GroupNode[] = groups.map((group) => {
    const choices: ChoiceNode[] = [...group.choices].sort(byOrder).map((choice) => {
      const foods = [...(foodsByChoice.get(choice.id) ?? [])].sort(byOrder);
      return { id: choice.id, label: choice.label, order: choice.order, foods, nutrition: sumRanges(foods.map(itemRange)) };
    });
    return { id: group.id, kind: group.kind, label: group.label, order: group.order, choices, nutrition: groupRange(group.kind, choices) };
  });

  // Item ainda sem escolha (dado anterior à conversão): entra no grupo fixo, como sempre foi lido.
  if (orphans.length > 0) {
    const fixed = nodes.find((g) => g.kind === MealGroupKind.fixed && g.choices.length > 0);
    if (fixed) {
      const target = fixed.choices[0];
      target.foods = [...target.foods, ...orphans].sort(byOrder);
      target.nutrition = sumRanges(target.foods.map(itemRange));
      fixed.nutrition = groupRange(fixed.kind, fixed.choices);
    } else {
      const foods = [...orphans].sort(byOrder);
      const choice: ChoiceNode = { id: null, label: null, order: 0, foods, nutrition: sumRanges(foods.map(itemRange)) };
      nodes.unshift({ id: null, kind: MealGroupKind.fixed, label: null, order: -1, choices: [choice], nutrition: choice.nutrition });
    }
  }

  return {
    id: meal.id,
    name: meal.name,
    order: meal.order,
    time: meal.time,
    notes: meal.notes,
    groups: nodes,
    nutrition: sumRanges(nodes.map((g) => g.nutrition)),
  };
}

export function buildDietTree(days: DayRow[], meals: MealRow[]): DayNode[] {
  const sortedDays: DayRow[] = days.length > 0 ? [...days].sort(byOrder) : [{ id: '', label: null, kind: DietDayKind.other, usageNotes: null, order: 0 }];
  const dayIds = new Set(sortedDays.map((d) => d.id));
  const fallbackDayId = sortedDays[0].id;
  return sortedDays.map((day) => {
    const dayMeals = meals
      .filter((m) => (m.dietDayId && dayIds.has(m.dietDayId) ? m.dietDayId : fallbackDayId) === day.id)
      .sort(byOrder)
      .map(buildMeal);
    return {
      id: day.id || null,
      label: day.label,
      kind: day.kind,
      usageNotes: day.usageNotes,
      order: day.order,
      meals: dayMeals,
      nutrition: sumRanges(dayMeals.map((m) => m.nutrition)),
    };
  });
}

/** Dieta "simples" (formato anterior): um dia sem nome e só grupos fixos. */
export function isSimpleStructure(tree: DayNode[]): boolean {
  return tree.length <= 1 && (tree[0]?.label ?? null) === null && tree.every((d) => d.meals.every((m) => m.groups.every((g) => g.kind === MealGroupKind.fixed)));
}

export function roundTree<T extends DayNode>(tree: T[]): DayNode[] {
  return tree.map((day) => ({
    ...day,
    nutrition: roundRange(day.nutrition),
    meals: day.meals.map((meal) => ({
      ...meal,
      nutrition: roundRange(meal.nutrition),
      groups: meal.groups.map((group) => ({
        ...group,
        nutrition: roundRange(group.nutrition),
        choices: group.choices.map((choice) => ({ ...choice, nutrition: roundRange(choice.nutrition) })),
      })),
    })),
  }));
}

// --- Formato antigo (achatado) — APK antigo e painel atual ---------------------

export interface FlatMeal {
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  /** Grupo fixo → null quando a refeição tem alternativas/opções (somar seria errado). */
  allFixed: boolean;
  foods: Array<FoodRow & { displayName: string }>;
}

export function foodDisplayName(food: FoodRow): string {
  // O nome ESCRITO pelo profissional vem primeiro; o do catálogo só quando não há nome escrito.
  const base = food.customFoodName ?? food.food?.name ?? 'Alimento';
  return food.isFreeQuantity ? `${base} (à vontade)` : base;
}

/**
 * Achata a árvore no formato antigo de "refeições com alimentos" SEM sugerir
 * que alternativas são consumidas juntas: cada opção completa vira uma
 * refeição própria ("— Opção 1 (escolha 1 opção)") e itens de bloco ganham
 * prefixo ("Carboidrato (escolha 1): Arroz"). Dieta simples sai idêntica.
 */
export function flattenForLegacy(tree: DayNode[]): FlatMeal[] {
  const result: FlatMeal[] = [];
  const multiDay = tree.length > 1 || tree.some((d) => d.label);
  for (const day of tree) {
    const prefix = multiDay && day.label ? `${day.label} · ` : '';
    for (const meal of day.meals) {
      const options = meal.groups.find((g) => g.kind === MealGroupKind.meal_options);
      if (options) {
        options.choices.forEach((choice, i) => {
          result.push({
            name: `${prefix}${meal.name} — ${choice.label ?? `Opção ${i + 1}`} (escolha 1 opção)`,
            order: result.length,
            time: meal.time,
            notes: meal.notes,
            allFixed: false,
            foods: choice.foods.map((f) => ({ ...f, displayName: foodDisplayName(f) })),
          });
        });
        continue;
      }
      const foods: FlatMeal['foods'] = [];
      for (const group of meal.groups) {
        group.choices.forEach((choice, i) => {
          for (const food of choice.foods) {
            let displayName = foodDisplayName(food);
            if (group.kind === MealGroupKind.alternatives) {
              const block = `${group.label ?? 'Alternativas'} (escolha 1)`;
              const option = choice.foods.length > 1 ? ` — ${choice.label ?? `opção ${i + 1}`}` : '';
              displayName = `${block}${option}: ${displayName}`;
            }
            foods.push({ ...food, displayName });
          }
        });
      }
      result.push({
        name: `${prefix}${meal.name}`,
        order: multiDay ? result.length : meal.order,
        time: meal.time,
        notes: meal.notes,
        allFixed: meal.groups.every((g) => g.kind === MealGroupKind.fixed),
        foods,
      });
    }
  }
  return result;
}

// --- Regras da estrutura (conferidas ao publicar) -------------------------------

/**
 * Problemas que impedem publicar. Dieta antiga/simples (só grupos fixos com
 * uma escolha) nunca tem problema aqui — as regras só afetam opções e blocos.
 */
export function structureProblems(tree: DayNode[]): string[] {
  const problems: string[] = [];
  for (const day of tree) {
    const dayLabel = day.label ? `${day.label} · ` : '';
    for (const meal of day.meals) {
      const where = `${dayLabel}${meal.name}`;
      const hasOptions = meal.groups.some((g) => g.kind === MealGroupKind.meal_options);
      if (hasOptions && meal.groups.length > 1) {
        problems.push(`${where}: refeição com opções completas não pode ter outros grupos.`);
      }
      for (const group of meal.groups) {
        const groupLabel = group.label ? ` (${group.label})` : '';
        if (group.kind === MealGroupKind.fixed && group.choices.length > 1) {
          problems.push(`${where}: grupo fixo${groupLabel} deve ter uma única escolha.`);
        }
        if (group.kind !== MealGroupKind.fixed) {
          if (group.choices.length === 0) problems.push(`${where}: grupo "escolher 1"${groupLabel} sem nenhuma opção.`);
          group.choices.forEach((choice, i) => {
            if (choice.foods.length === 0) problems.push(`${where}${groupLabel}: ${choice.label ?? `opção ${i + 1}`} sem alimentos.`);
          });
        }
      }
    }
  }
  return problems;
}
