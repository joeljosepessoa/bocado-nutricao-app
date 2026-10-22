import { unitLabel } from '../dietAssistant/draft';
import type { DietDayKind, DietDayNode, DietGroupNode, DietMealNode, DietSupplement, MealFood, MealGroupKind, Nutrients, NutritionRange } from '../types/api';

/**
 * Apoio da tela da estrutura nova de dieta. A nutrição NÃO é calculada aqui:
 * faixas e totais vêm prontos da API (opções/alternativas nunca somadas, dias
 * nunca somados entre si) — este módulo só formata e confere regras da UI.
 */

export const DAY_KIND_LABELS: Record<DietDayKind, string> = {
  training: 'Treino',
  rest: 'Descanso',
  other: 'Outro',
};

export const GROUP_KIND_TEXT: Record<MealGroupKind, { title: string; instruction: string }> = {
  fixed: { title: 'Itens fixos', instruction: 'Consumir todos' },
  meal_options: { title: 'Opções completas', instruction: 'Escolha 1 opção' },
  alternatives: { title: 'Alternativas', instruction: 'Escolha 1' },
};

const kcalFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const gramsFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function span(min: number, max: number, format: Intl.NumberFormat): string {
  const a = format.format(min);
  const b = format.format(max);
  return a === b ? a : `${a}–${b}`;
}

/** "350 kcal" ou "320–350 kcal" (menor e maior escolha possível — nunca a soma). */
export function formatKcal(range: NutritionRange): string {
  return `${span(range.min.kcal, range.max.kcal, kcalFormat)} kcal`;
}

export function formatMacros(range: NutritionRange): string {
  const part = (label: string, key: 'proteinG' | 'carbG' | 'fatG') => `${label} ${span(range.min[key], range.max[key], gramsFormat)} g`;
  return [part('P', 'proteinG'), part('C', 'carbG'), part('G', 'fatG')].join(' · ');
}

export function isRange(range: NutritionRange): boolean {
  return Math.round(range.min.kcal) !== Math.round(range.max.kcal);
}

export function foodName(food: MealFood): string {
  // O nome escrito pelo profissional vem primeiro; o do catálogo só quando não há nome escrito.
  return food.customFoodName ?? food.food?.name ?? 'Alimento';
}

/** "110 g", "3–5 g", "2 fatia(s)", "à vontade" — vazio quando não há quantidade. */
export function quantityText(food: Pick<MealFood, 'quantity' | 'quantityMax' | 'unit' | 'isFreeQuantity'>): string {
  if (food.isFreeQuantity) return 'à vontade';
  if (food.quantity == null) return '';
  const amount = food.quantityMax != null ? `${quantityFormat.format(food.quantity)}–${quantityFormat.format(food.quantityMax)}` : quantityFormat.format(food.quantity);
  return food.unit ? `${amount} ${unitLabel(food.unit)}` : amount;
}

/**
 * Situação do item para a tela. `null` = item com cálculo (mostra o kcal
 * gravado pela API). Nunca inventa valor para quem ficou fora da soma.
 */
export function foodCalcStatus(food: MealFood): 'À vontade' | 'Sem cálculo' | null {
  if (food.isFreeQuantity) return 'À vontade';
  if (!food.foodId || food.quantity == null || food.kcal == null) return 'Sem cálculo';
  return null;
}

export function supplementQuantityText(s: Pick<DietSupplement, 'quantity' | 'quantityMax' | 'unitText'>): string {
  if (s.quantity == null) return s.unitText ?? '';
  const amount = s.quantityMax != null ? `${quantityFormat.format(s.quantity)}–${quantityFormat.format(s.quantityMax)}` : quantityFormat.format(s.quantity);
  return s.unitText ? `${amount} ${s.unitText}` : amount;
}

export function dayTitle(day: Pick<DietDayNode, 'label' | 'kind'>, index: number): string {
  if (day.label) return day.label;
  if (day.kind === 'training') return 'Dia de treino';
  if (day.kind === 'rest') return 'Dia de descanso';
  return `Dia ${index + 1}`;
}

/** Dieta no formato anterior: um dia sem nome, só grupos fixos — a tela fica como antes. */
export function isSimpleDiet(days: DietDayNode[]): boolean {
  return days.length <= 1 && !days[0]?.label && days.every((d) => d.meals.every((m) => m.groups.every((g) => g.kind === 'fixed')));
}

/** Dias aparecem como abas quando há mais de um ou quando o único tem nome. */
export function showDayTabs(days: DietDayNode[]): boolean {
  return days.length > 1 || days.some((d) => !!d.label);
}

/**
 * Pendências que impedem publicar — as mesmas regras do backend (que continua
 * sendo a autoridade final) e mais as checagens de item da UI.
 */
export function structureProblems(days: DietDayNode[]): string[] {
  const problems: string[] = [];
  const multi = showDayTabs(days);
  days.forEach((day, d) => {
    const prefix = multi ? `${dayTitle(day, d)} · ` : '';
    for (const meal of day.meals) {
      const where = `${prefix}${meal.name}`;
      if (meal.groups.some((g) => g.kind === 'meal_options') && meal.groups.length > 1) {
        problems.push(`${where}: refeição com opções completas não pode ter outros grupos.`);
      }
      for (const group of meal.groups) {
        const groupLabel = group.label ? ` (${group.label})` : '';
        if (group.kind === 'fixed' && group.choices.length > 1) problems.push(`${where}: o grupo de itens fixos deve ter uma única lista.`);
        if (group.kind !== 'fixed') {
          if (group.choices.length === 0) {
            problems.push(
              group.kind === 'meal_options' ? `${where}: opções completas sem nenhuma opção.` : `${where}: bloco "escolha 1"${groupLabel} sem nenhuma alternativa.`,
            );
          }
          group.choices.forEach((choice, i) => {
            if (choice.foods.length === 0) problems.push(`${where}${groupLabel}: ${choice.label ?? `opção ${i + 1}`} sem alimentos.`);
          });
        }
        for (const choice of group.choices) {
          for (const food of choice.foods) {
            if (!food.foodId && !food.customFoodName?.trim()) problems.push(`${where}: há um alimento sem nome.`);
            if (food.quantityMax != null && (food.quantity == null || food.quantityMax < food.quantity)) {
              problems.push(`${where}: ${foodName(food)} com quantidade máxima menor que a mínima.`);
            }
          }
        }
      }
    }
  });
  return problems;
}

export interface FoodItemValues {
  foodId?: string;
  customFoodName?: string;
  quantity?: number;
  quantityMax?: number | null;
  unit?: string;
  isFreeQuantity: boolean;
  notes?: string;
}

/** Validação do item antes de enviar (o backend confere de novo). */
export function foodItemErrors(values: FoodItemValues): string[] {
  const errors: string[] = [];
  if (!values.foodId && !values.customFoodName?.trim()) errors.push('Informe o nome do alimento ou escolha um do catálogo.');
  if (values.isFreeQuantity) return errors;
  if (values.quantity !== undefined && !(values.quantity > 0)) errors.push('A quantidade precisa ser maior que zero.');
  if (values.quantityMax != null && (values.quantity === undefined || values.quantityMax < values.quantity)) {
    errors.push('A quantidade máxima não pode ser menor que a mínima.');
  }
  if (values.foodId && values.quantity !== undefined && !values.unit) errors.push('Escolha a unidade para calcular o alimento.');
  return errors;
}

export function supplementErrors(values: { name: string; quantity?: number; quantityMax?: number }): string[] {
  const errors: string[] = [];
  if (!values.name.trim()) errors.push('Informe o nome do suplemento.');
  if (values.quantity !== undefined && !(values.quantity > 0)) errors.push('A quantidade precisa ser maior que zero.');
  if (values.quantityMax !== undefined && (values.quantity === undefined || values.quantityMax < values.quantity)) {
    errors.push('A quantidade máxima não pode ser menor que a mínima.');
  }
  return errors;
}

/**
 * Reordenação: move o item `from` para `to` e devolve só as atualizações de
 * `order` necessárias (renumera a lista inteira — tolera ordens repetidas).
 */
export function reorderPatches<T extends { id: string | null; order: number }>(items: T[], from: number, to: number): Array<{ id: string; order: number }> {
  if (to < 0 || to >= items.length || from === to) return [];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.flatMap((item, index) => (item.id && item.order !== index ? [{ id: item.id, order: index }] : []));
}

// --- Comparação entre opções e totais com a 1ª opção ---------------------------

/** Diferença de kcal acima da qual uma opção/alternativa "tira o paciente da meta" ao ser escolhida. */
export const CHOICE_KCAL_TOLERANCE = 0.1;

const middle = (range: NutritionRange, key: keyof Nutrients) => (range.min[key] + range.max[key]) / 2;

/**
 * Diferença de kcal da escolha em relação à 1ª do mesmo bloco (−0,18 = 18% a
 * menos). null quando não há o que comparar: 1ª escolha, itens fixos, total
 * parcial (algum item sem cálculo) ou 1ª escolha sem kcal.
 */
export function choiceKcalDiff(group: Pick<DietGroupNode, 'kind' | 'choices'>, index: number): number | null {
  if (index === 0 || group.kind === 'fixed') return null;
  const base = group.choices[0]?.nutrition;
  const own = group.choices[index]?.nutrition;
  if (!base || !own || base.partial || own.partial) return null;
  const baseKcal = middle(base, 'kcal');
  if (baseKcal <= 0) return null;
  return (middle(own, 'kcal') - baseKcal) / baseKcal;
}

/** "+4%", "−18%", "igual" (diferença abaixo de 0,5%). */
export function formatKcalDiff(diff: number): string {
  const percent = Math.round(diff * 100);
  if (percent === 0) return 'igual';
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}

export interface ChoiceImbalance {
  day: string | null;
  meal: string;
  choice: string;
  diff: number;
  kcal: number;
  baseKcal: number;
  baseChoice: string;
}

/** Escolhas com kcal fora da tolerância em relação à 1ª do bloco, em toda a dieta. */
export function choiceImbalances(days: DietDayNode[]): ChoiceImbalance[] {
  const named = days.length > 1;
  const result: ChoiceImbalance[] = [];
  days.forEach((day, d) => {
    for (const meal of day.meals) {
      for (const group of meal.groups) {
        const titleOf = (i: number) => group.choices[i].label ?? (group.kind === 'meal_options' ? `Opção ${i + 1}` : `Alternativa ${i + 1}`);
        group.choices.forEach((choice, i) => {
          const diff = choiceKcalDiff(group, i);
          if (diff === null || Math.abs(diff) <= CHOICE_KCAL_TOLERANCE) return;
          result.push({
            day: named ? dayTitle(day, d) : null,
            meal: group.kind === 'alternatives' && group.label ? `${meal.name} · ${group.label}` : meal.name,
            choice: titleOf(i),
            diff,
            kcal: middle(choice.nutrition, 'kcal'),
            baseKcal: middle(group.choices[0].nutrition, 'kcal'),
            baseChoice: titleOf(0),
          });
        });
      }
    }
  });
  return result;
}

export interface FirstChoiceTotals extends Nutrients {
  /** Algum item da 1ª escolha não entrou na soma (à vontade, sem quantidade ou fora do catálogo). */
  partial: boolean;
}

const ZERO: FirstChoiceTotals = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0, partial: false };

function addNutrition(total: FirstChoiceTotals, range: NutritionRange): FirstChoiceTotals {
  return {
    kcal: total.kcal + middle(range, 'kcal'),
    proteinG: total.proteinG + middle(range, 'proteinG'),
    carbG: total.carbG + middle(range, 'carbG'),
    fatG: total.fatG + middle(range, 'fatG'),
    fiberG: total.fiberG + middle(range, 'fiberG'),
    partial: total.partial || range.partial,
  };
}

/** A refeição como fica com a 1ª opção/alternativa de cada bloco (faixa de quantidade conta pelo meio). */
export function mealFirstChoiceTotals(meal: Pick<DietMealNode, 'groups'>): FirstChoiceTotals {
  return meal.groups.reduce((total, group) => (group.choices[0] ? addNutrition(total, group.choices[0].nutrition) : total), ZERO);
}

/** O dia somando cada refeição com a 1ª escolha de cada bloco — a mesma base usada para comparar com a meta. */
export function dayFirstChoiceTotals(day: Pick<DietDayNode, 'meals'>): FirstChoiceTotals {
  return day.meals.reduce((total, meal) => {
    const m = mealFirstChoiceTotals(meal);
    return {
      kcal: total.kcal + m.kcal,
      proteinG: total.proteinG + m.proteinG,
      carbG: total.carbG + m.carbG,
      fatG: total.fatG + m.fatG,
      fiberG: total.fiberG + m.fiberG,
      partial: total.partial || m.partial,
    };
  }, ZERO);
}
