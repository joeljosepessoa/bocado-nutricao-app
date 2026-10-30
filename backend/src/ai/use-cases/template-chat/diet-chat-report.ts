import type { DietTemplateContentDto } from '../../../templates/dto/template.dto';
import type { CalculableFood } from '../create-diet/create-diet.use-case';

/**
 * Conferência da dieta da conversa, feita pelo SISTEMA (nunca pela IA): kcal e macros por refeição e no
 * dia, pela 1ª escolha de cada bloco (mesma base do editor), e quanto o dia ficou longe da meta da IA.
 */

export interface Macros {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface MealReport extends Macros {
  name: string;
  /** Algum item sem cálculo (fora da unidade base, "à vontade", alimento sem valores). */
  partial: boolean;
  /** Opções completas da refeição ("Opção 1", "Opção 2"…), com a diferença de kcal para a 1ª. */
  options: Array<{ label: string; kcal: number; diffPercent: number; foods: string[] }>;
}

export interface DayReport {
  label: string | null;
  meals: MealReport[];
  total: Macros;
  partial: boolean;
}

/** Metas que a IA declarou ao montar (null = não definiu, ex.: só um ajuste). */
export interface DietTargets {
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  /** A conta, em poucas linhas (ex.: "102 kg × 2,2 g = 224 g de proteína"). */
  calculation: string | null;
}

type Content = Pick<DietTemplateContentDto, 'days'>;
type Item = DietTemplateContentDto['days'][number]['meals'][number]['groups'][number]['choices'][number]['foods'][number];

const zero = (): Macros => ({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG });
const round = (m: Macros): Macros => ({ kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbG: Math.round(m.carbG), fatG: Math.round(m.fatG) });

function itemMacros(item: Item, foodsById: Map<string, CalculableFood>): { macros: Macros; partial: boolean } {
  const food = item.foodId ? foodsById.get(item.foodId) : undefined;
  if (!food || item.isFreeQuantity || item.quantity == null || item.unit !== food.baseUnit) return { macros: zero(), partial: true };
  const f = item.quantity / 100;
  return { macros: { kcal: food.kcalPer100! * f, proteinG: food.proteinGPer100! * f, carbG: food.carbGPer100! * f, fatG: food.fatGPer100! * f }, partial: false };
}

function choiceMacros(items: Item[], foodsById: Map<string, CalculableFood>) {
  return items.reduce(
    (acc, item) => {
      const r = itemMacros(item, foodsById);
      return { macros: add(acc.macros, r.macros), partial: acc.partial || r.partial };
    },
    { macros: zero(), partial: false },
  );
}

const itemName = (item: Item, foodsById: Map<string, CalculableFood>) =>
  (item.customFoodName ?? (item.foodId ? foodsById.get(item.foodId)?.name : undefined) ?? 'Item').trim();

/** Por dia: cada refeição pela 1ª escolha de cada bloco ("fixo" soma tudo), opções completas listadas à parte. */
export function dietReport(content: Content | null | undefined, foodsById: Map<string, CalculableFood>): DayReport[] {
  return (content?.days ?? []).map((day) => {
    const meals = day.meals.map((meal): MealReport => {
      let macros = zero();
      let partial = false;
      const options: MealReport['options'] = [];
      for (const group of meal.groups) {
        const choices = group.choices.map((choice) => choiceMacros(choice.foods, foodsById));
        const counted = group.kind === 'fixed' ? choices : choices.slice(0, 1);
        for (const c of counted) {
          macros = add(macros, c.macros);
          partial = partial || c.partial;
        }
        if (group.kind === 'meal_options' && group.choices.length > 1) {
          const first = choices[0]?.macros.kcal ?? 0;
          group.choices.forEach((choice, i) =>
            options.push({
              label: choice.label?.trim() || `Opção ${i + 1}`,
              kcal: Math.round(choices[i].macros.kcal),
              diffPercent: first > 0 ? Math.round(((choices[i].macros.kcal - first) / first) * 100) : 0,
              foods: choice.foods.map((item) => itemName(item, foodsById)),
            }),
          );
        }
      }
      return { name: meal.name, ...round(macros), partial, options };
    });
    const total = round(meals.reduce((acc, m) => add(acc, m), zero()));
    return { label: day.label ?? null, meals, total, partial: meals.some((m) => m.partial) };
  });
}

const percentOff = (value: number, target: number | null) => (target && target > 0 ? ((value - target) / target) * 100 : null);

/** Diferença do dia para a meta, em % (null = sem meta daquele item). */
export function gaps(day: DayReport, targets: DietTargets) {
  return {
    kcal: percentOff(day.total.kcal, targets.kcal),
    proteinG: percentOff(day.total.proteinG, targets.proteinG),
    carbG: percentOff(day.total.carbG, targets.carbG),
    fatG: percentOff(day.total.fatG, targets.fatG),
  };
}

export const KCAL_TOLERANCE_PERCENT = 5;
export const PROTEIN_TOLERANCE_PERCENT = 10;
export const OPTION_TOLERANCE_PERCENT = 10;

/** Quanto o dia ficou longe da meta (para escolher a versão mais perto). Infinity quando não há o que comparar. */
export function distance(days: DayReport[], targets: DietTargets | null): number {
  if (!targets?.kcal || days.length !== 1) return Infinity;
  const g = gaps(days[0], targets);
  return Math.abs(g.kcal ?? 0) + Math.abs(g.proteinG ?? 0) / 2;
}

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const macrosText = (m: Macros) => `${fmt(m.kcal)} kcal (P ${fmt(m.proteinG)} g, C ${fmt(m.carbG)} g, G ${fmt(m.fatG)} g)`;
const targetText = (t: DietTargets) =>
  [`${fmt(t.kcal!)} kcal`, t.proteinG ? `P ${fmt(t.proteinG)} g` : null, t.carbG ? `C ${fmt(t.carbG)} g` : null, t.fatG ? `G ${fmt(t.fatG)} g` : null]
    .filter(Boolean)
    .join(', ');

/**
 * Pedido de correção para a IA quando o dia montado ficou longe da meta que ela mesma definiu
 * (só dieta de um dia, com meta de kcal). null = está dentro da tolerância.
 */
export function revisionRequest(days: DayReport[], targets: DietTargets | null): string | null {
  if (!targets?.kcal || days.length !== 1 || days[0].partial) return null;
  const g = gaps(days[0], targets);
  const kcalOff = Math.abs(g.kcal ?? 0) > KCAL_TOLERANCE_PERCENT;
  const proteinOff = g.proteinG != null && Math.abs(g.proteinG) > PROTEIN_TOLERANCE_PERCENT;
  if (!kcalOff && !proteinOff) return null;
  const perMeal = days[0].meals.map((m) => `${m.name}: ${fmt(m.kcal)} kcal`).join('; ');
  return [
    '[Conferência automática do sistema — não é o nutricionista falando]',
    `Somando pelo catálogo (1ª opção de cada refeição), o dia ficou com ${macrosText(days[0].total)}.`,
    `A meta que você definiu é ${targetText(targets)}. Por refeição: ${perMeal}.`,
    `Ajuste as QUANTIDADES para o dia ficar a no máximo ±3% das calorias e perto dos macros da meta.`,
    'Mantenha as mesmas refeições, horários, opções e alimentos; troque ou acrescente alimento só se não houver outro jeito.',
    'Mantenha as opções de cada refeição com calorias parecidas com a Opção 1 (±10%). Devolva a dieta inteira e as mesmas "metas".',
  ].join('\n');
}

/** Avisos do sistema sobre a versão final: meta não atingida e opções muito diferentes da 1ª. */
export function reportWarnings(days: DayReport[], targets: DietTargets | null): string[] {
  const warnings: string[] = [];
  if (targets?.kcal && days.length === 1) {
    const g = gaps(days[0], targets);
    if (g.kcal != null && Math.abs(g.kcal) > KCAL_TOLERANCE_PERCENT) {
      warnings.push(
        `O dia ficou com ${fmt(days[0].total.kcal)} kcal, ${Math.abs(Math.round(g.kcal))}% ${g.kcal > 0 ? 'acima' : 'abaixo'} da meta de ${fmt(targets.kcal)} kcal — ajuste as quantidades no editor.`,
      );
    }
    if (g.proteinG != null && Math.abs(g.proteinG) > PROTEIN_TOLERANCE_PERCENT) {
      warnings.push(`A proteína ficou em ${fmt(days[0].total.proteinG)} g, longe da meta de ${fmt(targets.proteinG!)} g.`);
    }
  }
  for (const day of days) {
    for (const meal of day.meals) {
      const far = meal.options.filter((o) => Math.abs(o.diffPercent) > OPTION_TOLERANCE_PERCENT);
      if (far.length > 0) {
        warnings.push(`${meal.name}: ${far.map((o) => `${o.label} com ${o.diffPercent > 0 ? '+' : ''}${o.diffPercent}%`).join(', ')} de calorias em relação à 1ª opção.`);
      }
    }
  }
  return warnings;
}

/** O que a IA recebe sobre a dieta atual (números do sistema, para comparar com o pedido). */
export function reportForPrompt(days: DayReport[]) {
  return days.map((day) => ({
    dia: day.label,
    refeicoes: day.meals.map((m) => ({
      nome: m.name,
      kcal: m.kcal,
      proteina: m.proteinG,
      carboidrato: m.carbG,
      gordura: m.fatG,
      ...(m.options.length > 0 ? { opcoes: m.options.map((o) => ({ nome: o.label, kcal: o.kcal })) } : {}),
    })),
    totalPela1aOpcao: { kcal: day.total.kcal, proteina: day.total.proteinG, carboidrato: day.total.carbG, gordura: day.total.fatG },
    ...(day.partial ? { obs: 'alguns itens sem cálculo (fora da unidade base ou à vontade)' } : {}),
  }));
}
