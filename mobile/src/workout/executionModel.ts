import type { CreateExecutionLogInput, ExecutionSetInput, WorkoutClientDay, WorkoutClientSet } from '../types/api';
import { formatNumber } from '../diet/dietView';

/**
 * Execução do treino no app: séries marcadas, repetições, cargas e a
 * observação do paciente — tudo vira o registro salvo no banco ao finalizar.
 * PURO (sem React Native), para poder ser testado.
 */

export const DEFAULT_REST_SECONDS = 60;
export const REST_PRESETS = [30, 45, 60, 90, 120];
export const NOTES_MAX_LENGTH = 1000;

const LOAD_UNITS = ['kg', 'lb', 'bodyweight', 'band_level', 'other'];

export interface ExecutionSet {
  key: string;
  workoutExerciseId: string;
  /** Ordem da série vinda da prescrição (o que vai para o banco). */
  setOrder: number;
  /** Número exibido: 1, 2, 3... dentro do exercício. */
  number: number;
  done: boolean;
  reps: string;
  load: string;
  loadUnit: string | null;
  restSeconds: number;
}

export interface ExecutionExercise {
  workoutExerciseId: string;
  name: string;
  muscleGroup: string | null;
  imageUrl: string | null;
  sets: ExecutionSet[];
}

/** Estado inicial: prescrição do dia, já com repetições e carga sugeridas. */
export function buildExecution(day: WorkoutClientDay): ExecutionExercise[] {
  return [...day.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => ({
      workoutExerciseId: exercise.workoutExerciseId,
      name: exercise.exerciseName,
      muscleGroup: exercise.muscleGroup,
      imageUrl: exercise.imageUrl,
      sets: [...exercise.sets]
        .sort((a, b) => a.order - b.order)
        .map((set, index) => ({
          key: `${exercise.workoutExerciseId}-${set.order}`,
          workoutExerciseId: exercise.workoutExerciseId,
          setOrder: set.order,
          number: index + 1,
          done: false,
          reps: set.reps != null ? String(set.reps) : '',
          load: set.loadValue != null ? formatNumber(set.loadValue, 2) : '',
          loadUnit: set.loadUnit,
          restSeconds: set.restSeconds ?? DEFAULT_REST_SECONDS,
        })),
    }));
}

/** "22,5" ou "22.5" → 22.5; vazio ou inválido → undefined (não é enviado). */
export function parseDecimal(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || !/^\d+(\.\d+)?$/.test(normalized)) return undefined;
  return Number(normalized);
}

export function parseInteger(text: string): number | undefined {
  const normalized = text.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : undefined;
}

/** Resumo da prescrição: "12 reps · 20 kg · descanso 60s". */
export function prescriptionText(set: WorkoutClientSet): string {
  const parts: string[] = [];
  if (set.reps != null) parts.push(`${set.reps} reps`);
  if (set.durationSeconds != null) parts.push(`${set.durationSeconds}s`);
  if (set.loadValue != null) parts.push(`${formatNumber(set.loadValue, 2)} ${set.loadUnit ?? 'kg'}`);
  if (set.restSeconds != null) parts.push(`descanso ${set.restSeconds}s`);
  return parts.join(' · ') || 'Conforme orientação';
}

/** "3 séries · 12 reps" — resumo do exercício na lista de treinos. */
export function exerciseSummary(sets: WorkoutClientSet[]): string {
  const count = `${sets.length} ${sets.length === 1 ? 'série' : 'séries'}`;
  const reps = [...new Set(sets.map((s) => s.reps).filter((r): r is number => r != null))];
  return reps.length > 0 ? `${count} · ${reps.join('/')} reps` : count;
}

export function executionProgress(exercises: ExecutionExercise[]): { done: number; total: number; percent: number } {
  const all = exercises.flatMap((e) => e.sets);
  const done = all.filter((s) => s.done).length;
  return { done, total: all.length, percent: all.length > 0 ? done / all.length : 0 };
}

/**
 * O que vai para o banco ao finalizar: só as séries marcadas como feitas,
 * com as repetições e cargas digitadas, a observação e a data/hora.
 * Sem nenhuma série feita, null (nada a salvar).
 */
export function buildExecutionPayload(
  workoutDayId: string,
  exercises: ExecutionExercise[],
  notes: string,
  performedAt: Date,
): CreateExecutionLogInput | null {
  const sets = exercises
    .flatMap((e) => e.sets)
    .filter((s) => s.done)
    .map<ExecutionSetInput>((s) => {
      const loadValue = parseDecimal(s.load);
      return {
        workoutExerciseId: s.workoutExerciseId,
        setOrder: s.setOrder,
        repsPerformed: parseInteger(s.reps),
        loadValue,
        loadUnit: loadValue !== undefined ? (s.loadUnit && LOAD_UNITS.includes(s.loadUnit) ? s.loadUnit : 'kg') : undefined,
      };
    });
  if (sets.length === 0) return null;
  const trimmed = notes.trim().slice(0, NOTES_MAX_LENGTH);
  return {
    workoutDayId,
    performedAt: performedAt.toISOString(),
    ...(trimmed ? { notes: trimmed } : {}),
    sets,
  };
}
