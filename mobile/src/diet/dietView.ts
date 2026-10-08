import type { DietClientDay, DietClientSummary, DietClientSupplement } from '../types/api';

/**
 * Base da dieta do paciente: dias vindos da API (com o caminho de volta para a
 * API antiga), títulos e formatação de números. A montagem do que a tela
 * mostra fica em `dietPresentation.ts`.
 */

/** pt-BR sem depender de Intl: "1.800", "2,5". */
export function formatNumber(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const [int, frac] = String(Math.abs(rounded)).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

/** "3" ou "3–5" (faixa de quantidade). */
export function amountText(quantity: number, quantityMax: number | null | undefined): string {
  return quantityMax != null ? `${formatNumber(quantity, 2)}–${formatNumber(quantityMax, 2)}` : formatNumber(quantity, 2);
}

export function supplementQuantityText(s: Pick<DietClientSupplement, 'quantity' | 'quantityMax' | 'unitText'>): string {
  if (s.quantity == null) return s.unitText ?? '';
  const amount = amountText(s.quantity, s.quantityMax);
  return s.unitText ? `${amount} ${s.unitText}` : amount;
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
                  foods: meal.foods.map((f) => ({ ...f, isCustom: false, quantityMax: null, isFreeQuantity: false, notes: null })),
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
