import type { DietClientDay, DietClientFoodItem, DietClientGroup, DietClientMealNode, DietClientSummary, DietDayKind, SubstitutionOption } from '../types/api';
import { amountText, dayTitle, dietDays, showDayTabs, supplementQuantityText } from './dietView';

/**
 * Modelo da tela "Minha dieta" montado a partir da resposta da API. PURO:
 * sem chamada de API, sem estado e sem regra de banco — só organiza o que a
 * API envia (P1–P5: dia → refeição → grupo → escolha → alimento).
 *
 * Calorias e macros NÃO aparecem para o paciente: essa informação fica só no
 * painel do profissional. O que a API envia por alimento (kcal, proteína,
 * carboidrato, gordura) é ignorado aqui — nenhum total, faixa ou aviso de cálculo.
 */

// --- Modelo da tela -----------------------------------------------------------

export interface FoodLineView {
  /** "110 g de fruta", "2 fatias de pão integral", "2 ovos", "Salada de folhas". */
  text: string;
  /** "À vontade" — quantidade livre. */
  quantityNote: string | null;
  /** Observação do item ("Sem pele"). */
  notes: string | null;
  substitutions: SubstitutionOption[];
}

export interface ChoiceView {
  /** "Opção 1" nas opções completas; nos blocos só quando o profissional nomeou. */
  title: string | null;
  foods: FoodLineView[];
}

export type SectionView =
  | { kind: 'options'; title: string; choices: ChoiceView[] }
  | { kind: 'block'; title: string; instruction: string; choices: ChoiceView[] }
  | { kind: 'fixed'; title: string | null; foods: FoodLineView[] };

export interface MealView {
  key: string;
  icon: string;
  name: string;
  time: string | null;
  notes: string | null;
  sections: SectionView[];
}

export interface DayView {
  key: string;
  icon: string;
  title: string;
  usageNotes: string | null;
  meals: MealView[];
}

export interface SupplementView {
  name: string;
  dose: string | null;
  timing: string | null;
  notes: string | null;
}

export interface DietPresentation {
  title: string;
  /** Só quando a dieta tem opções ou blocos "escolha 1". */
  instruction: string | null;
  showDayTabs: boolean;
  days: DayView[];
  supplements: SupplementView[];
  guidelines: string[];
}

export const TEXT = {
  title: 'Minha dieta',
  instruction: 'Onde aparecer "Escolha 1", escolha só uma das opções.',
  options: 'Escolha 1 opção',
  blockInstruction: 'Escolha 1',
  fixed: 'Fixos',
  freeQuantity: 'À vontade',
} as const;

// --- Textos -------------------------------------------------------------------

const capitalize = (text: string) => (text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : text);
const clean = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);

const MASS_VOLUME = new Set(['g', 'ml', 'kg', 'l', 'mg']);
const HOUSEHOLD: Record<string, [singular: string, plural: string]> = {
  slice: ['fatia', 'fatias'],
  tablespoon: ['colher de sopa', 'colheres de sopa'],
  teaspoon: ['colher de chá', 'colheres de chá'],
  cup: ['xícara', 'xícaras'],
};

/** Linha legível: "110 g de fruta", "3–5 g de creatina", "2 fatias de pão integral", "2 ovos". */
export function foodLine(food: DietClientFoodItem): FoodLineView {
  const name = food.foodName.trim();
  const base = { notes: clean(food.notes) ? capitalize(clean(food.notes)!) : null, substitutions: food.substitutions ?? [] };
  if (food.isFreeQuantity) return { ...base, text: capitalize(name), quantityNote: TEXT.freeQuantity };
  if (food.quantity == null) return { ...base, text: capitalize(name), quantityNote: null };

  const amount = amountText(food.quantity, food.quantityMax);
  const unit = food.unit?.trim() ?? '';
  let text: string;
  if (!unit || unit === 'unit') text = `${amount} ${name}`;
  else if (MASS_VOLUME.has(unit)) text = `${amount} ${unit} de ${name}`;
  else if (HOUSEHOLD[unit]) {
    const [one, many] = HOUSEHOLD[unit];
    text = `${amount} ${food.quantityMax != null || food.quantity > 1 ? many : one} de ${name}`;
  } else text = `${amount} ${unit} de ${name}`;
  return { ...base, text, quantityNote: null };
}

const MEAL_ICONS: Array<[RegExp, string]> = [
  [/cafe/, '☕'],
  [/lanche|colacao/, '🥤'],
  [/almoco/, '☀️'],
  [/jantar|ceia/, '🌙'],
  [/treino/, '⚡'],
];
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function mealIcon(name: string): string {
  const n = normalize(name);
  return MEAL_ICONS.find(([pattern]) => pattern.test(n))?.[1] ?? '🍽️';
}

export function dayIcon(kind: DietDayKind): string {
  return kind === 'training' ? '🏋️' : kind === 'rest' ? '🛏️' : '📅';
}

/** Uma orientação por tópico, sem o marcador que o profissional digitou ("* ", "- ", "1."). */
export function guidelineItems(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// --- Montagem -----------------------------------------------------------------

function buildGroup(group: DietClientGroup): SectionView | null {
  const choices = group.choices.filter((c) => c.foods.length > 0);
  if (choices.length === 0) return null;

  if (group.kind === 'fixed') {
    return { kind: 'fixed', title: null, foods: choices.flatMap((c) => c.foods.map(foodLine)) };
  }
  const views: ChoiceView[] = choices.map((c, i) => ({
    title: group.kind === 'meal_options' ? (clean(c.label) ?? `Opção ${i + 1}`) : clean(c.label),
    foods: c.foods.map(foodLine),
  }));
  return group.kind === 'meal_options'
    ? { kind: 'options', title: TEXT.options, choices: views }
    : { kind: 'block', title: clean(group.label) ?? 'Alternativas', instruction: TEXT.blockInstruction, choices: views };
}

function buildMeal(meal: DietClientMealNode, key: string): MealView {
  const built = meal.groups.map(buildGroup).filter((g): g is SectionView => g !== null);
  const hasChoices = built.some((g) => g.kind !== 'fixed');
  // "Fixos" só identifica quando divide a refeição com opções/blocos; refeição só com fixos é uma lista normal.
  const sections = built.map((g) => (g.kind === 'fixed' && hasChoices ? { ...g, title: TEXT.fixed } : g));
  return { key, icon: mealIcon(meal.name), name: meal.name, time: clean(meal.time), notes: clean(meal.notes), sections };
}

function buildDay(day: DietClientDay, index: number): DayView {
  return {
    key: String(index),
    icon: dayIcon(day.kind),
    title: dayTitle(day, index),
    usageNotes: clean(day.usageNotes),
    meals: day.meals.map((meal, i) => buildMeal(meal, `${index}-${i}`)),
  };
}

export function buildDietPresentation(diet: DietClientSummary): DietPresentation {
  const days = dietDays(diet);
  const dayViews = days.map(buildDay);
  const hasChoices = dayViews.some((d) => d.meals.some((m) => m.sections.some((s) => s.kind !== 'fixed')));
  return {
    title: TEXT.title,
    instruction: hasChoices ? TEXT.instruction : null,
    showDayTabs: showDayTabs(days),
    days: dayViews,
    supplements: [...(diet.supplements ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        name: s.name.trim(),
        dose: clean(supplementQuantityText(s)),
        timing: clean(s.timing) ? capitalize(clean(s.timing)!) : null,
        notes: clean(s.notes) ? capitalize(clean(s.notes)!) : null,
      })),
    guidelines: guidelineItems(diet.patientGuidelines),
  };
}
