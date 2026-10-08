/**
 * Meta diária de água do paciente, nesta ordem:
 * 1. o valor que o nutricionista preencheu na ficha;
 * 2. 35 ml por kg do peso atual (último peso real registrado);
 * 3. 2000 ml quando não há nenhum peso.
 * `source` diz de onde veio, para o app explicar a meta.
 */
export type WaterGoalSource = 'professional' | 'weight' | 'default';

export const WATER_ML_PER_KG = 35;
export const DEFAULT_WATER_GOAL_ML = 2000;

export function resolveWaterGoal(
  professionalGoalMl: number | null | undefined,
  currentWeightKg: number | null | undefined,
): { goalMl: number; source: WaterGoalSource } {
  if (professionalGoalMl != null && professionalGoalMl > 0) {
    return { goalMl: professionalGoalMl, source: 'professional' };
  }
  if (currentWeightKg != null && currentWeightKg > 0) {
    return { goalMl: Math.round(currentWeightKg * WATER_ML_PER_KG), source: 'weight' };
  }
  return { goalMl: DEFAULT_WATER_GOAL_ML, source: 'default' };
}

/** "2026-10-08" → Date 00:00 UTC (coluna DATE); recusa datas inválidas. */
export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
