import type { DietDraft } from '../dietAssistant/draft';
import type { WorkoutDraft } from '../workoutAssistant/draft';
import type { DietChatResult } from '../types/api';
import type { DietReportData } from './chatMemory';

const kcalText = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** "1.780 kcal · P 120 g · C 180 g · G 60 g" por dia (faixa quando há escolhas), calculado pelo sistema. */
export function nutritionSummary(nutrition: DietChatResult['nutrition']): string | null {
  if (nutrition.length === 0) return null;
  return nutrition
    .map((day) => {
      const kcal = kcalText(day.min.kcal) === kcalText(day.max.kcal) ? `${kcalText(day.min.kcal)} kcal` : `${kcalText(day.min.kcal)}–${kcalText(day.max.kcal)} kcal`;
      const macros = `P ${Math.round(day.max.proteinG)} g · C ${Math.round(day.max.carbG)} g · G ${Math.round(day.max.fatG)} g`;
      const label = nutrition.length > 1 ? `${day.label ?? 'Dia'}: ` : '';
      return `${label}${kcal} · ${macros}${day.partial ? ' (alguns itens sem cálculo)' : ''}`;
    })
    .join('\n');
}

/** Rascunho ainda em branco (nenhum alimento/exercício): a IA monta do zero. */
export const dietHasFoods = (draft: DietDraft) => draft.days.some((d) => d.meals.some((m) => m.groups.some((g) => g.choices.some((c) => c.foods.length > 0))));
export const workoutHasExercises = (draft: WorkoutDraft) => draft.days.some((d) => d.exercises.length > 0);

/** Avisos do editor travam o pedido à IA (ela recebe o rascunho como está). */
export const blockedBy = (problems: string[]) =>
  problems.length > 0 ? `Antes de pedir à IA, corrija no editor: ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ' …' : ''}` : null;

/** Tabela de conferência para a bolha da IA (só quando a dieta mudou e o servidor mandou a conferência). */
export function dietReportOf(result: DietChatResult): DietReportData | null {
  if (!result.changed || !result.report || result.report.length === 0) return null;
  return { targets: result.targets ?? null, days: result.report, revised: !!result.revised };
}
