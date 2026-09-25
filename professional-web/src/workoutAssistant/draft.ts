import type {
  CatalogExerciseRef,
  CreateWorkoutFromProposalInput,
  ExerciseMatchStatus,
  LoadUnit,
  OrganizedWorkoutProposal,
  ProposalSet,
} from '../types/api';

export type RepsMode = 'exact' | 'range' | 'none';

export interface DraftSet {
  key: string;
  repsMode: RepsMode;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  restSeconds: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  tempo: string;
  notes: string;
}

/** `manual` = escolhido/adicionado pelo profissional na revisão. */
export type DraftMatch = ExerciseMatchStatus | 'manual';

export interface DraftExercise {
  key: string;
  /** Como a IA leu o nome no texto colado — null quando adicionado à mão. */
  rawName: string | null;
  exercise: CatalogExerciseRef | null;
  match: DraftMatch;
  candidates: CatalogExerciseRef[];
  muscleGroupHint: string | null;
  notes: string;
  sets: DraftSet[];
  /** Observações da IA que não viram aviso "vivo" — o profissional marca como revisadas. */
  notices: string[];
}

export interface DraftDay {
  key: string;
  name: string;
  notes: string;
  exercises: DraftExercise[];
  notices: string[];
}

export interface WorkoutDraft {
  days: DraftDay[];
  notices: string[];
}

/**
 * Mesmos textos do backend (organize-workout.use-case.ts). Estes são
 * recalculados aqui a cada edição, então somem quando o profissional
 * corrige o dado; os demais avisos chegam como observações a revisar.
 */
export const LIVE_WARNINGS = {
  exerciseNotFound: 'Exercício não encontrado no catálogo.',
  exerciseAmbiguous: 'Nome do exercício possui mais de uma correspondência possível.',
  exerciseNotSelected: 'Selecione um exercício do catálogo.',
  restMissing: 'Descanso não informado.',
  repsMissing: 'Repetições não informadas.',
  setsMissing: 'Séries não informadas.',
  dayWithoutExercises: 'Nenhum exercício identificado neste dia.',
  dayNameBlank: 'Informe o nome do dia.',
} as const;

const LIVE_TEXTS = new Set<string>(Object.values(LIVE_WARNINGS));

let sequence = 0;
const nextKey = (prefix: string) => `${prefix}-${++sequence}`;

function repsModeOf(set: Pick<ProposalSet, 'reps' | 'repsMin' | 'repsMax'>): RepsMode {
  if (set.repsMin !== null || set.repsMax !== null) return 'range';
  return set.reps !== null ? 'exact' : 'none';
}

export function emptySet(): DraftSet {
  return {
    key: nextKey('set'),
    repsMode: 'exact',
    reps: null,
    repsMin: null,
    repsMax: null,
    loadValue: null,
    loadUnit: null,
    restSeconds: null,
    durationSeconds: null,
    distanceMeters: null,
    tempo: '',
    notes: '',
  };
}

function toDraftSet(set: ProposalSet): DraftSet {
  return {
    key: nextKey('set'),
    repsMode: repsModeOf(set),
    reps: set.reps,
    repsMin: set.repsMin,
    repsMax: set.repsMax,
    loadValue: set.loadValue,
    loadUnit: set.loadUnit,
    restSeconds: set.restSeconds,
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    tempo: set.tempo ?? '',
    notes: set.notes ?? '',
  };
}

export function proposalToDraft(proposal: OrganizedWorkoutProposal): WorkoutDraft {
  return {
    notices: proposal.warnings,
    days: proposal.days.map((day) => ({
      key: nextKey('day'),
      name: day.name,
      notes: day.notes ?? '',
      notices: day.warnings.filter((w) => !LIVE_TEXTS.has(w)),
      exercises: day.exercises.map((exercise) => ({
        key: nextKey('ex'),
        rawName: exercise.rawName,
        exercise: exercise.matchedExercise,
        match: exercise.matchStatus,
        candidates: exercise.candidates,
        muscleGroupHint: exercise.muscleGroupHint,
        notes: exercise.notes ?? '',
        sets: exercise.sets.map(toDraftSet),
        notices: exercise.warnings.filter((w) => !LIVE_TEXTS.has(w)),
      })),
    })),
  };
}

export function manualExercise(exercise: CatalogExerciseRef): DraftExercise {
  return {
    key: nextKey('ex'),
    rawName: null,
    exercise,
    match: 'manual',
    candidates: [],
    muscleGroupHint: null,
    notes: '',
    sets: [emptySet()],
    notices: [],
  };
}

export function exerciseWarnings(exercise: DraftExercise): string[] {
  const warnings: string[] = [];
  if (!exercise.exercise) {
    if (exercise.match === 'ambiguous') warnings.push(LIVE_WARNINGS.exerciseAmbiguous);
    else if (exercise.match === 'not_found') warnings.push(LIVE_WARNINGS.exerciseNotFound);
    else warnings.push(LIVE_WARNINGS.exerciseNotSelected);
  }
  if (exercise.sets.length === 0) {
    warnings.push(LIVE_WARNINGS.setsMissing);
  } else {
    if (exercise.sets.every((s) => s.restSeconds === null)) warnings.push(LIVE_WARNINGS.restMissing);
    if (exercise.sets.some((s) => s.repsMode === 'none' && s.durationSeconds === null && s.distanceMeters === null)) {
      warnings.push(LIVE_WARNINGS.repsMissing);
    }
  }
  return warnings;
}

export function dayWarnings(day: DraftDay): string[] {
  const warnings: string[] = [];
  if (!day.name.trim()) warnings.push(LIVE_WARNINGS.dayNameBlank);
  if (day.exercises.length === 0) warnings.push(LIVE_WARNINGS.dayWithoutExercises);
  return warnings;
}

/** Só o que impede gravar um treino estruturalmente válido — avisos nunca bloqueiam. */
export function draftProblems(draft: WorkoutDraft): string[] {
  const problems: string[] = [];
  if (draft.days.length === 0) problems.push('Adicione pelo menos um dia.');
  draft.days.forEach((day, d) => {
    const dayLabel = `Dia ${d + 1}${day.name.trim() ? ` (${day.name.trim()})` : ''}`;
    if (!day.name.trim()) problems.push(`${dayLabel}: informe o nome do dia.`);
    day.exercises.forEach((exercise, e) => {
      const exLabel = `${dayLabel}, exercício ${e + 1}${exercise.rawName ? ` ("${exercise.rawName}")` : ''}`;
      if (!exercise.exercise) problems.push(`${exLabel}: selecione um exercício do catálogo.`);
      exercise.sets.forEach((set, s) => {
        const setLabel = `${exLabel}, série ${s + 1}`;
        if (set.repsMode === 'exact' && set.reps === null) {
          problems.push(`${setLabel}: informe as repetições ou marque "não informado".`);
        }
        if (set.repsMode === 'range') {
          if (set.repsMin === null || set.repsMax === null) problems.push(`${setLabel}: informe mínimo e máximo da faixa.`);
          else if (set.repsMin > set.repsMax) problems.push(`${setLabel}: o mínimo da faixa é maior que o máximo.`);
        }
      });
    });
  });
  return problems;
}

const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

function toPayloadSet(set: DraftSet): ProposalSet {
  return {
    reps: set.repsMode === 'exact' ? set.reps : null,
    repsMin: set.repsMode === 'range' ? set.repsMin : null,
    repsMax: set.repsMode === 'range' ? set.repsMax : null,
    loadValue: set.loadValue,
    loadUnit: set.loadUnit,
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    restSeconds: set.restSeconds,
    tempo: blankToNull(set.tempo),
    notes: blankToNull(set.notes),
  };
}

/** Chame só com `draftProblems(draft)` vazio. */
export function draftToPayload(draft: WorkoutDraft): CreateWorkoutFromProposalInput {
  return {
    days: draft.days.map((day) => ({
      name: day.name.trim(),
      notes: blankToNull(day.notes),
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exercise!.id,
        notes: blankToNull(exercise.notes),
        sets: exercise.sets.map(toPayloadSet),
      })),
    })),
  };
}

/** Trocar o modo limpa os campos do outro modo — nunca escolhe um número dentro da faixa. */
export function setRepsMode(set: DraftSet, mode: RepsMode): DraftSet {
  if (mode === set.repsMode) return set;
  return {
    ...set,
    repsMode: mode,
    reps: mode === 'exact' ? set.reps : null,
    repsMin: mode === 'range' ? set.repsMin : null,
    repsMax: mode === 'range' ? set.repsMax : null,
  };
}

// --- Atualizações imutáveis ----------------------------------------------

export function updateDay(draft: WorkoutDraft, dayKey: string, fn: (day: DraftDay) => DraftDay): WorkoutDraft {
  return { ...draft, days: draft.days.map((day) => (day.key === dayKey ? fn(day) : day)) };
}

export function updateExercise(
  draft: WorkoutDraft,
  dayKey: string,
  exerciseKey: string,
  fn: (exercise: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return updateDay(draft, dayKey, (day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => (exercise.key === exerciseKey ? fn(exercise) : exercise)),
  }));
}

export function selectExercise(exercise: DraftExercise, chosen: CatalogExerciseRef): DraftExercise {
  return { ...exercise, exercise: chosen, match: exercise.match === 'matched' && exercise.exercise?.id === chosen.id ? 'matched' : 'manual' };
}

export function moveExercise(draft: WorkoutDraft, dayKey: string, exerciseKey: string, direction: -1 | 1): WorkoutDraft {
  return updateDay(draft, dayKey, (day) => {
    const index = day.exercises.findIndex((exercise) => exercise.key === exerciseKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= day.exercises.length) return day;
    const exercises = [...day.exercises];
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    return { ...day, exercises };
  });
}

export function removeExercise(draft: WorkoutDraft, dayKey: string, exerciseKey: string): WorkoutDraft {
  return updateDay(draft, dayKey, (day) => ({ ...day, exercises: day.exercises.filter((exercise) => exercise.key !== exerciseKey) }));
}

export function removeDay(draft: WorkoutDraft, dayKey: string): WorkoutDraft {
  return { ...draft, days: draft.days.filter((day) => day.key !== dayKey) };
}

export function withoutNotice(notices: string[], notice: string): string[] {
  return notices.filter((n) => n !== notice);
}
