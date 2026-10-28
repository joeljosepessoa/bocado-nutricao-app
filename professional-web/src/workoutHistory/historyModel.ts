import type { WorkoutHistorySession, WorkoutHistorySet } from '../types/api';
import { formatSeconds } from '../lib/workoutFormat';

const UNIT: Record<string, string> = { kg: 'kg', lb: 'lb', bodyweight: 'peso corporal', band_level: 'elástico', other: '' };

/** 27.5 → "27,5" */
export const num = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Uma série feita: "12 × 25 kg", "12 reps", "12 × peso corporal", "45s", "1,2 km". */
export function setText(set: WorkoutHistorySet): string {
  const load =
    set.loadValue != null ? `${num(set.loadValue)}${set.loadUnit && UNIT[set.loadUnit] ? ` ${UNIT[set.loadUnit]}` : ''}` : set.loadUnit === 'bodyweight' ? 'peso corporal' : null;
  const parts: string[] = [];
  if (set.reps != null) parts.push(load ? `${set.reps} × ${load}` : `${set.reps} reps`);
  else if (load) parts.push(load);
  if (set.durationSeconds != null) parts.push(formatSeconds(set.durationSeconds));
  if (set.distanceMeters != null) parts.push(set.distanceMeters >= 1000 ? `${num(set.distanceMeters / 1000)} km` : `${num(set.distanceMeters)} m`);
  return parts.join(' · ') || 'feita';
}

export const setsCount = (session: WorkoutHistorySession) => session.exercises.reduce((total, e) => total + e.sets.length, 0);

const DAY = 24 * 60 * 60 * 1000;

/** Quantas sessões nos últimos `days` dias (contando hoje). */
export function sessionsInLast(sessions: WorkoutHistorySession[], days: number, now: Date = new Date()): number {
  const since = now.getTime() - days * DAY;
  return sessions.filter((s) => new Date(s.performedAt).getTime() >= since).length;
}

/** "hoje", "ontem", "há 3 dias". */
export function daysAgoText(iso: string, now: Date = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(new Date(iso))) / DAY);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  unit: string;
  /** Maior carga de cada sessão, da mais antiga para a mais recente. */
  points: Array<{ performedAt: string; load: number; reps: number | null }>;
  first: number;
  last: number;
}

/**
 * Evolução da carga por exercício: a maior carga de cada sessão (só séries com carga, na unidade mais usada
 * do exercício). Exercícios feitos mais recentemente primeiro.
 */
export function exerciseProgress(sessions: WorkoutHistorySession[]): ExerciseProgress[] {
  type Entry = { name: string; lastSeen: number; units: Map<string, number>; perSession: Array<{ performedAt: string; sets: WorkoutHistorySet[] }> };
  const byExercise = new Map<string, Entry>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const loaded = exercise.sets.filter((s) => s.loadValue != null);
      if (loaded.length === 0) continue;
      const entry: Entry = byExercise.get(exercise.exerciseId) ?? { name: exercise.name, lastSeen: 0, units: new Map<string, number>(), perSession: [] };
      entry.lastSeen = Math.max(entry.lastSeen, new Date(session.performedAt).getTime());
      for (const s of loaded) entry.units.set(s.loadUnit ?? '', (entry.units.get(s.loadUnit ?? '') ?? 0) + 1);
      entry.perSession.push({ performedAt: session.performedAt, sets: loaded });
      byExercise.set(exercise.exerciseId, entry);
    }
  }

  const result: Array<ExerciseProgress & { lastSeen: number }> = [];
  for (const [exerciseId, entry] of byExercise) {
    const unit = [...entry.units].sort((a, b) => b[1] - a[1])[0][0];
    const points = entry.perSession
      .map(({ performedAt, sets }) => {
        const same = sets.filter((s) => (s.loadUnit ?? '') === unit);
        if (same.length === 0) return null;
        const top = same.reduce((best, s) => (s.loadValue! > best.loadValue! || (s.loadValue === best.loadValue && (s.reps ?? 0) > (best.reps ?? 0)) ? s : best));
        return { performedAt, load: top.loadValue!, reps: top.reps };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime());
    if (points.length === 0) continue;
    result.push({ exerciseId, name: entry.name, unit: UNIT[unit] ?? unit, points, first: points[0].load, last: points[points.length - 1].load, lastSeen: entry.lastSeen });
  }
  return result.sort((a, b) => b.lastSeen - a.lastSeen || a.name.localeCompare(b.name, 'pt-BR')).map(({ lastSeen: _lastSeen, ...rest }) => rest);
}

/** "20 kg → 27,5 kg (+7,5 kg)" ou "25 kg" quando só há uma sessão. */
export function progressText(p: ExerciseProgress): string {
  const withUnit = (v: number) => (p.unit ? `${num(v)} ${p.unit}` : num(v));
  if (p.points.length < 2) return withUnit(p.last);
  const delta = p.last - p.first;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${withUnit(p.first)} → ${withUnit(p.last)}${delta !== 0 ? ` (${sign}${withUnit(Math.abs(delta))})` : ' (igual)'}`;
}
