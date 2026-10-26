import type { CreateExecutionLogInput, ExecutionSetInput, WorkoutClientDay, WorkoutClientLastPerformance, WorkoutClientSet } from '../types/api';
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
  /** O que foi prescrito ("12" ou "8–12") — aparece como dica no campo de repetições. */
  repsTarget: string | null;
  /** Observação do profissional para esta série. */
  notes: string | null;
}

export interface ExecutionExercise {
  workoutExerciseId: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  /** Observação/técnica do profissional para este exercício. */
  notes: string | null;
  /** Como executar (cadastro do exercício). */
  instructions: string | null;
  imageUrl: string | null;
  sets: ExecutionSet[];
  /** "Última vez (17/10): 30 · 35 kg" — de onde veio a carga já preenchida; null se ainda não fez. */
  lastTime: string | null;
}

/** Última execução guardada no próprio aparelho (treino salvo ou ainda na fila sem internet), por exercício do treino. */
export type LocalLastPerformance = Record<string, WorkoutClientLastPerformance>;

/** A mais recente entre a do servidor e a guardada no aparelho (o aparelho pode ter um treino ainda não enviado). */
export function pickLastPerformance(
  server: WorkoutClientLastPerformance | null | undefined,
  local: WorkoutClientLastPerformance | undefined,
): WorkoutClientLastPerformance | null {
  if (!server) return local ?? null;
  if (!local) return server;
  return new Date(local.performedAt).getTime() > new Date(server.performedAt).getTime() ? local : server;
}

const UNIT_TEXT: Record<string, string> = { kg: 'kg', lb: 'lb', band_level: '(nível)', bodyweight: '', other: '' };

/** "Última vez (17/10): 30 · 35 kg"; null quando a última vez não teve carga. */
export function lastTimeText(last: WorkoutClientLastPerformance | null): string | null {
  if (!last) return null;
  const loads = last.sets.filter((s) => s.loadValue != null);
  if (loads.length === 0) return null;
  const values = [...new Set(loads.map((s) => formatNumber(s.loadValue!, 2)))];
  const unit = UNIT_TEXT[loads[0].loadUnit ?? 'kg'] ?? '';
  const date = new Date(last.performedAt);
  const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `Última vez (${day}): ${values.join(' · ')}${unit ? ` ${unit}` : ''}`;
}

/** Guarda no aparelho o que acabou de ser feito, por exercício do treino (para a próxima vez já vir preenchido). */
export function localLastFromPayload(payload: CreateExecutionLogInput): LocalLastPerformance {
  const result: LocalLastPerformance = {};
  for (const set of payload.sets) {
    const entry = (result[set.workoutExerciseId] ??= { performedAt: payload.performedAt ?? new Date().toISOString(), sets: [] });
    entry.sets.push({ setOrder: set.setOrder, repsPerformed: set.repsPerformed ?? null, loadValue: set.loadValue ?? null, loadUnit: set.loadUnit ?? null });
  }
  for (const entry of Object.values(result)) entry.sets.sort((a, b) => a.setOrder - b.setOrder);
  return result;
}

const clean = (text: string | null | undefined): string | null => (text && text.trim() ? text.trim() : null);

/** "12" ou "8–12" (faixa nunca vira um número só); null quando não há repetições prescritas. */
export function repsText(set: Pick<WorkoutClientSet, 'reps' | 'repsMin' | 'repsMax'>): string | null {
  if (set.reps != null) return String(set.reps);
  if (set.repsMin != null && set.repsMax != null) return `${set.repsMin}–${set.repsMax}`;
  return null;
}

/** Estado inicial: prescrição do dia, já com repetições e carga sugeridas. */
export function buildExecution(day: WorkoutClientDay, local: LocalLastPerformance = {}): ExecutionExercise[] {
  return [...day.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => {
      // A carga da última vez vem preenchida (série a série; se a prescrição tiver mais séries, repete a última carga).
      const last = pickLastPerformance(exercise.lastPerformance, local[exercise.workoutExerciseId]);
      const lastLoads = (last?.sets ?? []).filter((s) => s.loadValue != null);
      const lastLoadAt = (index: number) => (lastLoads.length > 0 ? (lastLoads[index] ?? lastLoads[lastLoads.length - 1]).loadValue : null);
      return {
      workoutExerciseId: exercise.workoutExerciseId,
      name: exercise.exerciseName,
      muscleGroup: exercise.muscleGroup,
      equipment: clean(exercise.equipment),
      notes: clean(exercise.notes),
      instructions: clean(exercise.instructions),
      imageUrl: exercise.imageUrl,
      lastTime: lastTimeText(last),
      sets: [...exercise.sets]
        .sort((a, b) => a.order - b.order)
        .map((set, index) => ({
          key: `${exercise.workoutExerciseId}-${set.order}`,
          workoutExerciseId: exercise.workoutExerciseId,
          setOrder: set.order,
          number: index + 1,
          done: false,
          reps: set.reps != null ? String(set.reps) : '',
          load: lastLoadAt(index) != null ? formatNumber(lastLoadAt(index)!, 2) : set.loadValue != null ? formatNumber(set.loadValue, 2) : '',
          loadUnit: set.loadUnit,
          restSeconds: set.restSeconds ?? DEFAULT_REST_SECONDS,
          repsTarget: repsText(set),
          notes: clean(set.notes),
        })),
      };
    });
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

/** Resumo da prescrição: "12 reps · 20 kg · descanso 60s"; faixa vira "8–12 reps". */
export function prescriptionText(set: WorkoutClientSet): string {
  const parts: string[] = [];
  const reps = repsText(set);
  if (reps) parts.push(`${reps} reps`);
  if (set.durationSeconds != null) parts.push(`${set.durationSeconds}s`);
  if (set.distanceMeters != null) parts.push(`${formatNumber(set.distanceMeters, 2)} m`);
  if (set.loadValue != null) parts.push(`${formatNumber(set.loadValue, 2)} ${set.loadUnit ?? 'kg'}`);
  if (set.restSeconds != null) parts.push(`descanso ${set.restSeconds}s`);
  return parts.join(' · ') || 'Conforme orientação';
}

/** "3 séries · 12 reps" — resumo do exercício na lista de treinos. */
export function exerciseSummary(sets: WorkoutClientSet[]): string {
  const count = `${sets.length} ${sets.length === 1 ? 'série' : 'séries'}`;
  const reps = [...new Set(sets.map(repsText).filter((r): r is string => r != null))];
  return reps.length > 0 ? `${count} · ${reps.join(' / ')} reps` : count;
}

const WEEKDAYS: Array<[string, string]> = [
  ['segunda', 'Seg'],
  ['terca', 'Ter'],
  ['quarta', 'Qua'],
  ['quinta', 'Qui'],
  ['sexta', 'Sex'],
  ['sabado', 'Sáb'],
  ['domingo', 'Dom'],
];

/**
 * Rótulo curto do dia para os botões do topo: "Seg" para "SEGUNDA - PEITO",
 * o próprio nome quando é curto ("Treino A", "Dia 1") e "Dia N" quando o nome é
 * longo ("GLÚTEO E POSTERIOR") — o nome inteiro aparece no título logo abaixo.
 */
export function dayTabLabel(name: string, index: number): string {
  const head = name.split(/\s[-–—]\s|:|\+/)[0].trim();
  const plain = head.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const weekday = WEEKDAYS.find(([prefix]) => plain.startsWith(prefix));
  if (weekday) return weekday[1];
  return head.length > 0 && head.length <= 9 ? head : `Dia ${index + 1}`;
}

/** "4x" + "6–8": o resumo do exercício. Séries diferentes entre si viram "12 / 10 / 8"; sem repetições, só a contagem. */
export function prescriptionSummary(sets: ExecutionSet[]): { count: string; reps: string | null } {
  const reps = [...new Set(sets.map((set) => set.repsTarget).filter((r): r is string => r != null))];
  return { count: `${sets.length}x`, reps: reps.length > 0 ? reps.join(' / ') : null };
}

/** "90 segundos" / "1 segundo". */
export function restLabel(seconds: number): string {
  return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
}

/** Carga única do exercício: o valor quando todas as séries têm a mesma; "" quando diferem ou não há. */
export function commonLoad(sets: ExecutionSet[]): string {
  const loads = [...new Set(sets.map((set) => set.load.trim()))];
  return loads.length === 1 ? loads[0] : '';
}

/** Unidade da carga do exercício (a da prescrição; kg quando não há). */
export function loadUnitOf(sets: ExecutionSet[]): string {
  return sets.find((set) => set.loadUnit)?.loadUnit ?? 'kg';
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
