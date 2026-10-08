import type { WaterHistory, WeightEntry, WorkoutClientSummary, WorkoutExecutionRecord, WorkoutExecutionSetRecord } from '../types/api';
import { formatNumber } from '../diet/dietView';
import { localDateKey } from '../dashboard/dashboardModel';

/**
 * Regras das telas Registro de Peso, Água e Histórico. PURO (sem React
 * Native), para poder ser testado.
 */

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;
export const WATER_QUICK_AMOUNTS = [150, 250, 350, 500];
export const WATER_MAX_ENTRY_ML = 3000;

/** "72,4" ou "72.4" → 72.4; null quando vazio, inválido ou fora de 20–400 kg. */
export function parseWeightInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= WEIGHT_MIN_KG && value <= WEIGHT_MAX_KG ? value : null;
}

/** Quantidade de água digitada (ml inteiros, 10–3000). */
export function parseWaterInput(text: string): number | null {
  const normalized = text.trim();
  if (!/^\d{1,4}$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= 10 && value <= WATER_MAX_ENTRY_ML ? value : null;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "2026-10-08" (dia de calendário) → "08/10/2026", sem passar por fuso. */
export function formatCalendarDay(key: string): string {
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

/** "+1,2 kg", "-0,8 kg", "0 kg". */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '0 kg';
  return `${rounded > 0 ? '+' : '-'}${formatNumber(Math.abs(rounded), 1)} kg`;
}

export interface WeightRow extends WeightEntry {
  /** Diferença para o registro anterior; null no primeiro. */
  delta: number | null;
}

/** Histórico do mais recente para o mais antigo, com a variação para o registro anterior. */
export function weightRows(items: WeightEntry[]): WeightRow[] {
  const chronological = [...items].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  return chronological
    .map((item, i) => ({ ...item, delta: i === 0 ? null : item.weightKg - chronological[i - 1].weightKg }))
    .reverse();
}

/** Variação total entre o primeiro e o último registro real; null com menos de 2. */
export function totalWeightChange(items: WeightEntry[]): number | null {
  if (items.length < 2) return null;
  const chronological = [...items].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  return chronological[chronological.length - 1].weightKg - chronological[0].weightKg;
}

export interface WaterBar {
  date: string;
  /** "Seg", "Ter"... */
  weekday: string;
  totalMl: number;
  percent: number;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Últimos `days` dias (hoje por último). Dia sem registro aparece com 0 ml —
 * é o que foi registrado, não uma estimativa.
 */
export function waterBars(history: WaterHistory, today: Date, days = 7): WaterBar[] {
  const totals = new Map(history.days.map((d) => [d.date, d.totalMl]));
  const bars: WaterBar[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = localDateKey(date);
    const totalMl = totals.get(key) ?? 0;
    bars.push({
      date: key,
      weekday: WEEKDAYS[date.getDay()],
      totalMl,
      percent: history.goalMl > 0 ? Math.min(totalMl / history.goalMl, 1) : 0,
    });
  }
  return bars;
}

// --- Histórico de treinos -------------------------------------------------------

export interface ExecutionExerciseView {
  name: string;
  /** "12 reps · 20 kg", "10 reps", "série feita". */
  sets: string[];
}

export interface ExecutionView {
  id: string;
  date: string;
  dayName: string;
  notes: string | null;
  setCount: number;
  exercises: ExecutionExerciseView[];
}

function setText(set: WorkoutExecutionSetRecord): string {
  const parts: string[] = [];
  if (set.repsPerformed != null) parts.push(`${set.repsPerformed} reps`);
  if (set.loadValue != null) parts.push(`${formatNumber(set.loadValue, 2)} ${set.loadUnit ?? 'kg'}`);
  return parts.length > 0 ? parts.join(' · ') : 'série feita';
}

/**
 * Um treino concluído com os nomes do treino atual. Exercício de uma versão
 * antiga do treino (sem nome conhecido) aparece como "Exercício".
 */
export function executionView(record: WorkoutExecutionRecord, workout: WorkoutClientSummary | null): ExecutionView {
  const day = workout?.days.find((d) => d.workoutDayId === record.workoutDayId);
  const names = new Map((workout?.days ?? []).flatMap((d) => d.exercises.map((e) => [e.workoutExerciseId, e.exerciseName] as const)));
  const groups = new Map<string, WorkoutExecutionSetRecord[]>();
  for (const set of [...record.sets].sort((a, b) => a.setOrder - b.setOrder)) {
    groups.set(set.workoutExerciseId, [...(groups.get(set.workoutExerciseId) ?? []), set]);
  }
  return {
    id: record.id,
    date: formatDateTime(record.performedAt),
    dayName: day?.name ?? 'Treino',
    notes: record.notes?.trim() ? record.notes.trim() : null,
    setCount: record.sets.length,
    exercises: [...groups.entries()].map(([id, sets]) => ({ name: names.get(id) ?? 'Exercício', sets: sets.map(setText) })),
  };
}
