import type { TrackingWaterHistory, TrackingWeightEntry } from '../types/api';

/**
 * Resumo do que o paciente registra no app (aba Acompanhamento). Só organiza
 * os registros reais; nada é estimado.
 */

export interface WeightSummary {
  latest: TrackingWeightEntry | null;
  first: TrackingWeightEntry | null;
  /** Diferença entre o primeiro e o último registro; null com menos de 2. */
  change: number | null;
  /** Quanto falta para a meta (positivo = acima da meta); null sem meta ou sem peso. */
  toTarget: number | null;
}

export function weightSummary(items: TrackingWeightEntry[], targetWeightKg: number | null): WeightSummary {
  const sorted = [...items].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const first = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    latest,
    first,
    change: sorted.length >= 2 && first && latest ? round(latest.weightKg - first.weightKg) : null,
    toTarget: latest && targetWeightKg != null ? round(latest.weightKg - targetWeightKg) : null,
  };
}

export interface WaterSummary {
  /** Dias com registro no período. */
  daysWithRecords: number;
  /** Desses, quantos bateram a meta atual. */
  daysOnGoal: number;
  /** Média dos dias com registro (ml); null sem registros. */
  averageMl: number | null;
}

export function waterSummary(history: TrackingWaterHistory): WaterSummary {
  const days = history.days;
  if (days.length === 0) return { daysWithRecords: 0, daysOnGoal: 0, averageMl: null };
  return {
    daysWithRecords: days.length,
    daysOnGoal: days.filter((d) => d.totalMl >= history.goalMl).length,
    averageMl: Math.round(days.reduce((sum, d) => sum + d.totalMl, 0) / days.length),
  };
}

export const WATER_GOAL_SOURCE: Record<TrackingWaterHistory['goalSource'], string> = {
  professional: 'meta definida na ficha',
  weight: 'calculada: 35 ml por kg do peso atual',
  default: 'padrão de 2000 ml (sem peso registrado)',
};

/** "2026-10-08" → "08/10" (dia do calendário, sem passar por fuso). */
export function shortCalendarDay(key: string): string {
  const [, month, day] = key.split('-');
  return `${day}/${month}`;
}
