import type { DietClientDay, WaterDay, WeightEntry, WorkoutClientDay, WorkoutClientSummary } from '../types/api';
import type { DayView, MealView } from '../diet/dietPresentation';
import { formatNumber } from '../diet/dietView';

/**
 * Regras do Dashboard do paciente. PURO (sem React Native): só organiza o que
 * veio da API. Nada é inventado — sem dado real, o valor fica vazio ("--",
 * "Registrar" ou a linha some), nunca vira um número fixo.
 */

export type DietDayChoice = 'training' | 'rest';
export const DIET_DAY_STORAGE_KEY = 'dashboard.dietDay';
export const WEIGHT_CHART_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dia no calendário do aparelho ("2026-10-08"), não em UTC. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatKg(value: number): string {
  return `${formatNumber(value, 1)} kg`;
}

export function formatMl(value: number): string {
  return value >= 1000 ? `${formatNumber(value / 1000, 2)} L` : `${formatNumber(value, 0)} ml`;
}

// --- Peso ---------------------------------------------------------------------

export interface WeightPoint {
  timestamp: number;
  value: number;
}

/** Um ponto por registro real, só dos últimos 30 dias, em ordem cronológica. */
export function weightChartPoints(items: WeightEntry[], now: Date, days = WEIGHT_CHART_DAYS): WeightPoint[] {
  const since = now.getTime() - days * DAY_MS;
  return items
    .map((item) => ({ timestamp: new Date(item.recordedAt).getTime(), value: item.weightKg }))
    .filter((point) => Number.isFinite(point.timestamp) && point.timestamp >= since && point.timestamp <= now.getTime() + DAY_MS)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Último peso real registrado, ou null. */
export function latestWeight(items: WeightEntry[]): WeightEntry | null {
  if (items.length === 0) return null;
  return items.reduce((latest, item) => (new Date(item.recordedAt) > new Date(latest.recordedAt) ? item : latest));
}

/** Meta de peso só existe se o nutricionista preencheu; sem ela, "--". */
export function weightGoalText(targetWeightKg: number | null | undefined): string {
  return targetWeightKg != null ? formatKg(targetWeightKg) : '--';
}

// --- Dieta do dia -------------------------------------------------------------

/** O seletor treino/descanso só aparece quando a dieta tem os dois tipos de dia. */
export function hasTrainingAndRest(days: Pick<DietClientDay, 'kind'>[]): boolean {
  return days.some((d) => d.kind === 'training') && days.some((d) => d.kind === 'rest');
}

/** Índice do dia da dieta para "hoje": o tipo escolhido pelo paciente; sem esse tipo, o primeiro dia. */
export function dietDayIndex(days: Pick<DietClientDay, 'kind'>[], choice: DietDayChoice): number {
  if (days.length === 0) return -1;
  const index = days.findIndex((d) => d.kind === choice);
  return index >= 0 ? index : 0;
}

export interface DailyGoals {
  /** Calorias do dia escolhido, calculadas da dieta; null quando não há cálculo. */
  kcalText: string | null;
  mealCount: number;
}

export function dailyGoals(day: DayView | null): DailyGoals | null {
  if (!day) return null;
  return {
    kcalText: day.calories.status === 'unavailable' ? null : day.calories.text,
    mealCount: day.meals.length,
  };
}

/** "7:30", "07h30", "7h", "12:00 h" → minutos desde 00:00; null se não for um horário. */
export function parseMealTime(text: string | null | undefined): number | null {
  const match = /(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/i.exec((text ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Próxima refeição real do dia: a primeira com horário ainda por vir. Sem
 * horários na dieta ou depois da última refeição, null (a linha some).
 */
export function nextMeal(meals: MealView[], now: Date): { name: string; time: string } | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = meals
    .map((meal) => ({ meal, minutes: parseMealTime(meal.time) }))
    .filter((item): item is { meal: MealView; minutes: number } => item.minutes !== null && item.minutes >= nowMinutes)
    .sort((a, b) => a.minutes - b.minutes)[0];
  return upcoming ? { name: upcoming.meal.name, time: upcoming.meal.time as string } : null;
}

// --- Água ---------------------------------------------------------------------

export function waterProgress(day: WaterDay | null): { percent: number; remainingMl: number } | null {
  if (!day) return null;
  const percent = day.goalMl > 0 ? Math.min(day.totalMl / day.goalMl, 1) : 0;
  return { percent, remainingMl: Math.max(day.goalMl - day.totalMl, 0) };
}

export function waterGoalNote(source: WaterDay['goalSource']): string {
  if (source === 'professional') return 'Meta definida pelo seu nutricionista';
  if (source === 'weight') return 'Meta calculada: 35 ml por kg do seu peso atual';
  return 'Meta padrão: registre seu peso para uma meta personalizada';
}

// --- Treino -------------------------------------------------------------------

/**
 * Próximo treino: o dia seguinte ao último treino concluído, em ciclo; sem
 * nenhum concluído, o primeiro dia. Sem treino publicado, null.
 */
export function nextWorkoutDay(
  workout: WorkoutClientSummary | null,
  lastExecutedDayId: string | null,
): WorkoutClientDay | null {
  if (!workout || workout.days.length === 0) return null;
  const days = [...workout.days].sort((a, b) => a.order - b.order);
  const lastIndex = lastExecutedDayId ? days.findIndex((d) => d.workoutDayId === lastExecutedDayId) : -1;
  return days[(lastIndex + 1) % days.length];
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
