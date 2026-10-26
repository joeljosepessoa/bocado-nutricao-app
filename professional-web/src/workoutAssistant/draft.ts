import type {
  CatalogExerciseRef,
  CreateWorkoutFromProposalInput,
  ExerciseMatchStatus,
  LoadUnit,
  OrganizedWorkoutProposal,
  ProposalSet,
  WorkoutTemplateContent,
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

export const EXERCISE_LEFT_CATALOG = 'Este exercício saiu do catálogo: escolha outro.';

/** Modelo salvo → rascunho do editor. `exercises` traz os exercícios do catálogo usados no modelo (com o GIF atual). */
export function templateToDraft(content: WorkoutTemplateContent, exercises: CatalogExerciseRef[]): WorkoutDraft {
  const catalog = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return {
    notices: [],
    days: content.days.map((day) => ({
      key: nextKey('day'),
      name: day.name,
      notes: day.notes ?? '',
      notices: [],
      exercises: day.exercises.map((item) => {
        const exercise = catalog.get(item.exerciseId) ?? null;
        return {
          key: nextKey('ex'),
          rawName: null,
          exercise,
          match: exercise ? 'manual' : 'not_found',
          candidates: [],
          muscleGroupHint: null,
          notes: item.notes ?? '',
          // Campo vazio pode vir ausente do JSON salvo: vira null antes de decidir o modo das repetições.
          sets: item.sets.map((set) =>
            toDraftSet({
              reps: set.reps ?? null,
              repsMin: set.repsMin ?? null,
              repsMax: set.repsMax ?? null,
              loadValue: set.loadValue ?? null,
              loadUnit: set.loadUnit ?? null,
              durationSeconds: set.durationSeconds ?? null,
              distanceMeters: set.distanceMeters ?? null,
              restSeconds: set.restSeconds ?? null,
              tempo: set.tempo ?? null,
              notes: set.notes ?? null,
            }),
          ),
          notices: exercise ? [] : [EXERCISE_LEFT_CATALOG],
        };
      }),
    })),
  };
}

/** Preset da biblioteca → exercício pronto no rascunho (séries, repetições e descanso do preset). */
export function exerciseFromPreset(preset: {
  sets: number;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  exercise: { id: string; name: string; muscleGroups: string[]; equipment: string | null; imageUrl: string | null };
}): DraftExercise {
  const base = manualExercise({
    id: preset.exercise.id,
    name: preset.exercise.name,
    muscleGroup: preset.exercise.muscleGroups[0] ?? null,
    equipment: preset.exercise.equipment,
    imageUrl: preset.exercise.imageUrl,
  });
  const range = preset.repsMin != null && preset.repsMax != null;
  return {
    ...base,
    sets: Array.from({ length: Math.max(1, preset.sets) }, () => ({
      ...emptySet(),
      repsMode: range ? ('range' as const) : preset.reps != null ? ('exact' as const) : ('none' as const),
      reps: range ? null : preset.reps,
      repsMin: range ? preset.repsMin : null,
      repsMax: range ? preset.repsMax : null,
      restSeconds: preset.restSeconds,
    })),
  };
}

/** Novo dia em branco: "Treino B", "Treino C"… */
export function addDay(draft: WorkoutDraft): WorkoutDraft {
  const letter = String.fromCharCode(65 + (draft.days.length % 26));
  return { ...draft, days: [...draft.days, { key: nextKey('day'), name: `Treino ${letter}`, notes: '', notices: [], exercises: [] }] };
}

/** Modelo novo: um dia em branco. */
export function emptyWorkoutDraft(): WorkoutDraft {
  return { notices: [], days: [{ key: nextKey('day'), name: 'Treino A', notes: '', notices: [], exercises: [] }] };
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

/**
 * `withoutGifs`: modo "Organizar sem GIFs" — o exercício lido do texto vale pelo
 * nome que o profissional escreveu e é cadastrado no catálogo dele ao criar o
 * treino; não precisa ser escolhido no catálogo antes.
 */
export interface DraftRules {
  withoutGifs?: boolean;
}

/** Fica com o nome escrito no texto (modo "sem GIFs"), sem exercício do catálogo escolhido. */
export function usesWrittenName(exercise: DraftExercise, rules: DraftRules = {}): boolean {
  return !!rules.withoutGifs && !exercise.exercise && !!exercise.rawName?.trim();
}

export function exerciseWarnings(exercise: DraftExercise, rules: DraftRules = {}): string[] {
  const warnings: string[] = [];
  if (!exercise.exercise && !usesWrittenName(exercise, rules)) {
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
export function draftProblems(draft: WorkoutDraft, rules: DraftRules = {}): string[] {
  const problems: string[] = [];
  if (draft.days.length === 0) problems.push('Adicione pelo menos um dia.');
  draft.days.forEach((day, d) => {
    const dayLabel = `Dia ${d + 1}${day.name.trim() ? ` (${day.name.trim()})` : ''}`;
    if (!day.name.trim()) problems.push(`${dayLabel}: informe o nome do dia.`);
    day.exercises.forEach((exercise, e) => {
      const exLabel = `${dayLabel}, exercício ${e + 1}${exercise.rawName ? ` ("${exercise.rawName}")` : ''}`;
      if (!exercise.exercise && !usesWrittenName(exercise, rules)) problems.push(`${exLabel}: selecione um exercício do catálogo.`);
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
