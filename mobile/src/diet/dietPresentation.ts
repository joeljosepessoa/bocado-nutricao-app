import type { DietClientDay, DietClientFoodItem, DietClientGroup, DietClientMealNode, DietClientSummary, DietDayKind, SubstitutionOption } from '../types/api';
import { amountText, dayTitle, dietDays, formatNumber, showDayTabs, supplementQuantityText } from './dietView';

/**
 * Modelo da tela "Minha dieta" montado a partir da resposta da API. PURO:
 * sem chamada de API, sem estado e sem regra de banco — só organiza o que a
 * API envia (P1–P5: dia → refeição → grupo → escolha → alimento).
 *
 * Calorias: cada alimento traz a própria kcal (ou null quando não há cálculo).
 * Um total só aparece quando TODOS os alimentos com quantidade daquele trecho
 * têm cálculo. Falta de dado nunca vira 0, e uma opção sem dado nunca entra
 * como mínimo de uma faixa. "À vontade" não tem quantidade e não conta como falta.
 */

// --- Modelo da tela -----------------------------------------------------------

export type CalorieStatus = 'calculated' | 'partial' | 'unavailable';

export interface CalorieInfo {
  status: CalorieStatus;
  /** "350 kcal", "320–350 kcal" ou "a partir de 120 kcal"; null quando não há o que mostrar. */
  text: string | null;
  /** Macros do trecho (só quando calculado por completo). */
  macros: string | null;
}

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
  calories: CalorieInfo;
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
  calories: CalorieInfo;
}

export interface DayView {
  key: string;
  icon: string;
  title: string;
  usageNotes: string | null;
  calories: CalorieInfo;
  /** Aviso discreto, uma vez por dia, quando falta cálculo. */
  calorieNote: string | null;
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
  partialNote: 'Cálculo parcial: alguns alimentos ainda não têm informação calórica.',
  unavailableNote: 'Informação calórica indisponível.',
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

// --- Calorias -----------------------------------------------------------------

interface Macros {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** Soma do que tem cálculo + quantos alimentos ficaram sem cálculo. */
interface Calc {
  min: Macros;
  max: Macros;
  calculated: number;
  missing: number;
  /** Algum alimento com kcal mas sem algum macro (marcador da TACO) — macros não são mostrados. */
  macrosMissing: boolean;
}

const ZERO: Macros = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
const KEYS: (keyof Macros)[] = ['kcal', 'proteinG', 'carbG', 'fatG'];
const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG });
const empty = (): Calc => ({ min: ZERO, max: ZERO, calculated: 0, missing: 0, macrosMissing: false });

function foodCalc(food: DietClientFoodItem): Calc {
  if (food.isFreeQuantity) return empty();
  if (food.kcal == null) return { ...empty(), missing: 1 };
  const min: Macros = { kcal: food.kcal, proteinG: food.proteinG ?? 0, carbG: food.carbG ?? 0, fatG: food.fatG ?? 0 };
  // Faixa de quantidade ("3 a 5 g"): o valor da API é o da quantidade mínima.
  const factor = food.quantityMax != null && food.quantity ? food.quantityMax / food.quantity : 1;
  const max = Object.fromEntries(KEYS.map((k) => [k, min[k] * factor])) as unknown as Macros;
  return { min, max, calculated: 1, missing: 0, macrosMissing: food.proteinG == null || food.carbG == null || food.fatG == null };
}

function sum(parts: Calc[]): Calc {
  return parts.reduce(
    (acc, c) => ({
      min: add(acc.min, c.min),
      max: add(acc.max, c.max),
      calculated: acc.calculated + c.calculated,
      missing: acc.missing + c.missing,
      macrosMissing: acc.macrosMissing || c.macrosMissing,
    }),
    empty(),
  );
}

/** "Escolha 1": faixa entre a menor e a maior escolha — nunca a soma. */
function chooseOne(parts: Calc[]): Calc {
  if (parts.length === 0) return empty();
  const pick = (fn: (...n: number[]) => number, side: 'min' | 'max') =>
    Object.fromEntries(KEYS.map((k) => [k, fn(...parts.map((p) => p[side][k]))])) as unknown as Macros;
  return {
    min: pick(Math.min, 'min'),
    max: pick(Math.max, 'max'),
    calculated: parts.reduce((n, p) => n + p.calculated, 0),
    missing: parts.reduce((n, p) => n + p.missing, 0),
    macrosMissing: parts.some((p) => p.macrosMissing),
  };
}

const span = (min: number, max: number, decimals: number) => {
  const a = formatNumber(min, decimals);
  const b = formatNumber(max, decimals);
  return a === b ? a : `${a}–${b}`;
};

function calories(calc: Calc): CalorieInfo {
  if (calc.calculated === 0) return { status: 'unavailable', text: null, macros: null };
  if (calc.missing > 0) {
    // O que tem cálculo é um piso real; o teto é desconhecido. Piso 0 não é mostrado.
    return { status: 'partial', text: Math.round(calc.min.kcal) > 0 ? `a partir de ${formatNumber(calc.min.kcal, 0)} kcal` : null, macros: null };
  }
  const macros = calc.macrosMissing
    ? null
    : `Proteína ${span(calc.min.proteinG, calc.max.proteinG, 0)} g · Carboidrato ${span(calc.min.carbG, calc.max.carbG, 0)} g · Gordura ${span(calc.min.fatG, calc.max.fatG, 0)} g`;
  return { status: 'calculated', text: `${span(calc.min.kcal, calc.max.kcal, 0)} kcal`, macros };
}

// --- Montagem -----------------------------------------------------------------

interface Built<T> {
  view: T;
  calc: Calc;
}

function buildGroup(group: DietClientGroup): Built<SectionView> | null {
  const choices = group.choices.filter((c) => c.foods.length > 0);
  if (choices.length === 0) return null;
  const choiceCalcs = choices.map((c) => sum(c.foods.map(foodCalc)));

  if (group.kind === 'fixed') {
    return { view: { kind: 'fixed', title: null, foods: choices.flatMap((c) => c.foods.map(foodLine)) }, calc: sum(choiceCalcs) };
  }
  const views: ChoiceView[] = choices.map((c, i) => ({
    title: group.kind === 'meal_options' ? (clean(c.label) ?? `Opção ${i + 1}`) : clean(c.label),
    foods: c.foods.map(foodLine),
    calories: calories(choiceCalcs[i]),
  }));
  const view: SectionView =
    group.kind === 'meal_options'
      ? { kind: 'options', title: TEXT.options, choices: views }
      : { kind: 'block', title: clean(group.label) ?? 'Alternativas', instruction: TEXT.blockInstruction, choices: views };
  return { view, calc: chooseOne(choiceCalcs) };
}

function buildMeal(meal: DietClientMealNode, key: string): Built<MealView> {
  const built = meal.groups.map(buildGroup).filter((g): g is Built<SectionView> => g !== null);
  const hasChoices = built.some((g) => g.view.kind !== 'fixed');
  // "Fixos" só identifica quando divide a refeição com opções/blocos; refeição só com fixos é uma lista normal.
  const sections = built.map((g) => (g.view.kind === 'fixed' && hasChoices ? { ...g.view, title: TEXT.fixed } : g.view));
  const calc = sum(built.map((g) => g.calc));
  const info = calories(calc);
  return {
    view: {
      key,
      icon: mealIcon(meal.name),
      name: meal.name,
      time: clean(meal.time),
      notes: clean(meal.notes),
      sections,
      // Na refeição: total completo, ou o piso quando parcial — nunca só o aviso (ele aparece uma vez no dia).
      calories: info,
    },
    calc,
  };
}

function buildDay(day: DietClientDay, index: number): DayView {
  const meals = day.meals.map((meal, i) => buildMeal(meal, `${index}-${i}`));
  const info = calories(sum(meals.map((m) => m.calc)));
  return {
    key: String(index),
    icon: dayIcon(day.kind),
    title: dayTitle(day, index),
    usageNotes: clean(day.usageNotes),
    calories: info,
    calorieNote: info.status === 'partial' ? TEXT.partialNote : info.status === 'unavailable' && meals.length > 0 ? TEXT.unavailableNote : null,
    meals: meals.map((m) => m.view),
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
