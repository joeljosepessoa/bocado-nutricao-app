import type {
  DietClientDay,
  DietClientFoodItem,
  DietClientGroup,
  DietClientSummary,
  DietClientSupplement,
  MealGroupKind,
  NutritionRange,
} from '../types/api';

/**
 * Apoio da tela de dieta do paciente. A nutrição NÃO é calculada aqui: faixas
 * e totais vêm prontos da API (opções/alternativas nunca somadas, dias nunca
 * somados). Este módulo só organiza e formata o que a API envia.
 */

const UNIT_LABELS: Record<string, string> = {
  g: 'g',
  ml: 'ml',
  unit: 'unidade(s)',
  tablespoon: 'colher(es) de sopa',
  teaspoon: 'colher(es) de chá',
  cup: 'xícara(s)',
  slice: 'fatia(s)',
};

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

/** pt-BR sem depender de Intl: "1.800", "2,5". */
function formatNumber(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const [int, frac] = String(Math.abs(rounded)).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

function span(min: number, max: number, decimals: number): string {
  const a = formatNumber(min, decimals);
  const b = formatNumber(max, decimals);
  return a === b ? a : `${a}–${b}`;
}

/** "350 kcal" ou "320–350 kcal" (menor e maior escolha possível — nunca a soma). */
export function formatKcal(range: NutritionRange): string {
  return `${span(range.min.kcal, range.max.kcal, 0)} kcal`;
}

export function formatMacros(range: NutritionRange): string {
  const part = (label: string, key: 'proteinG' | 'carbG' | 'fatG') => `${label} ${span(range.min[key], range.max[key], 1)}g`;
  return [part('P', 'proteinG'), part('C', 'carbG'), part('G', 'fatG')].join(' · ');
}

export function isRange(range: NutritionRange): boolean {
  return Math.round(range.min.kcal) !== Math.round(range.max.kcal);
}

/** "110 g", "3–5 g", "2 fatia(s)", "à vontade" — vazio quando não há quantidade. */
export function quantityText(food: Pick<DietClientFoodItem, 'quantity' | 'quantityMax' | 'unit' | 'isFreeQuantity'>): string {
  if (food.isFreeQuantity) return 'à vontade';
  if (food.quantity == null) return '';
  const amount = food.quantityMax != null ? `${formatNumber(food.quantity, 2)}–${formatNumber(food.quantityMax, 2)}` : formatNumber(food.quantity, 2);
  return food.unit ? `${amount} ${unitLabel(food.unit)}` : amount;
}

/** Item sem cálculo (à vontade, fora do catálogo, sem quantidade): nunca mostra kcal inventado. */
export function foodStatus(food: DietClientFoodItem): 'À vontade' | 'Sem cálculo' | null {
  if (food.isFreeQuantity) return 'À vontade';
  if (food.isCustom || food.quantity == null || food.kcal == null) return 'Sem cálculo';
  return null;
}

export function supplementQuantityText(s: Pick<DietClientSupplement, 'quantity' | 'quantityMax' | 'unitText'>): string {
  if (s.quantity == null) return s.unitText ?? '';
  const amount = s.quantityMax != null ? `${formatNumber(s.quantity, 2)}–${formatNumber(s.quantityMax, 2)}` : formatNumber(s.quantity, 2);
  return s.unitText ? `${amount} ${s.unitText}` : amount;
}

export const GROUP_TEXT: Record<MealGroupKind, { title: string; instruction: string }> = {
  fixed: { title: 'Itens fixos', instruction: 'Consumir todos' },
  meal_options: { title: 'Opções', instruction: 'Escolha 1 opção' },
  alternatives: { title: 'Alternativas', instruction: 'Escolha 1' },
};

export function groupTitle(group: Pick<DietClientGroup, 'kind' | 'label'>): string {
  return group.kind === 'alternatives' ? (group.label ?? GROUP_TEXT.alternatives.title) : GROUP_TEXT[group.kind].title;
}

export function choiceTitle(label: string | null, index: number): string {
  return label ?? `Opção ${index + 1}`;
}

export function dayTitle(day: Pick<DietClientDay, 'label' | 'kind'>, index: number): string {
  if (day.label) return day.label;
  if (day.kind === 'training') return 'Dia de treino';
  if (day.kind === 'rest') return 'Dia de descanso';
  return `Dia ${index + 1}`;
}

/** Seletor de dia só quando há mais de um dia ou o único tem nome. */
export function showDayTabs(days: DietClientDay[]): boolean {
  return days.length > 1 || days.some((d) => !!d.label);
}

/**
 * Dias da dieta para a tela. Com a API atual vem pronto (`days`); se a API for
 * anterior à estrutura nova, o formato antigo vira um dia único só com itens
 * fixos — exatamente como era mostrado (sem faixas, que a API antiga não envia).
 */
export function dietDays(diet: DietClientSummary): DietClientDay[] {
  if (diet.days && diet.days.length > 0) {
    return [...diet.days]
      .sort((a, b) => a.order - b.order)
      .map((day) => ({
        ...day,
        meals: [...day.meals]
          .sort((a, b) => a.order - b.order)
          .map((meal) => ({
            ...meal,
            groups: [...meal.groups].sort((a, b) => a.order - b.order).map((g) => ({ ...g, choices: [...g.choices].sort((a, b) => a.order - b.order) })),
          })),
      }));
  }
  return [
    {
      label: null,
      kind: 'other',
      usageNotes: null,
      order: 0,
      nutrition: null,
      meals: [...diet.meals]
        .sort((a, b) => a.order - b.order)
        .map((meal) => ({
          name: meal.name,
          order: meal.order,
          time: meal.time,
          notes: meal.notes,
          nutrition: null,
          groups: [
            {
              kind: 'fixed',
              label: null,
              order: 0,
              nutrition: null,
              choices: [
                {
                  label: null,
                  order: 0,
                  nutrition: null,
                  foods: meal.foods.map((f) => ({ ...f, isCustom: false, quantityMax: null, isFreeQuantity: false })),
                },
              ],
            },
          ],
        })),
    },
  ];
}

/** Texto do cartão "Minha dieta" no início — refeições contadas por tipo de dia (opções não viram refeições). */
export function mealSummary(diet: DietClientSummary): string {
  const days = dietDays(diet);
  const count = (n: number) => `${n} ${n === 1 ? 'refeição' : 'refeições'}`;
  if (!showDayTabs(days)) return `${count(days[0]?.meals.length ?? 0)} prescrita${(days[0]?.meals.length ?? 0) === 1 ? '' : 's'}.`;
  return days.map((day, i) => `${dayTitle(day, i)}: ${count(day.meals.length)}`).join(' · ');
}
