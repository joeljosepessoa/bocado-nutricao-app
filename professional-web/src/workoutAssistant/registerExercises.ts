import * as api from '../api/endpoints';
import { sameExerciseName } from '../lib/exerciseMedia';
import type { CatalogExerciseRef, Exercise } from '../types/api';
import { selectExercise, updateExercise, type WorkoutDraft } from './draft';

/** Exercício lido do texto que ainda não tem um exercício do catálogo ligado. */
export interface PendingExercise {
  dayKey: string;
  exerciseKey: string;
  /** O nome como está no texto colado pelo profissional. */
  name: string;
  muscleGroup: string | null;
  /** O catálogo tem algo parecido: melhor o profissional olhar antes de cadastrar outro. */
  hasSuggestions: boolean;
}

const tidy = (name: string) => name.replace(/\s+/g, ' ').trim();

export function pendingExercises(draft: WorkoutDraft): PendingExercise[] {
  return draft.days.flatMap((day) =>
    day.exercises
      .filter((exercise) => !exercise.exercise && !!exercise.rawName && tidy(exercise.rawName) !== '')
      .map((exercise) => ({
        dayKey: day.key,
        exerciseKey: exercise.key,
        name: tidy(exercise.rawName as string),
        muscleGroup: exercise.muscleGroupHint?.trim() || null,
        hasSuggestions: exercise.candidates.length > 0,
      })),
  );
}

/** Os que entram no cadastro em lote: não encontrados e sem nenhuma sugestão do catálogo. */
export function pendingWithoutSuggestions(draft: WorkoutDraft): PendingExercise[] {
  return pendingExercises(draft).filter((pending) => !pending.hasSuggestions);
}

/** Nomes distintos (a menos de acento/caixa), na ordem do texto. */
export function distinctNames(pending: PendingExercise[]): string[] {
  return pending.reduce<string[]>((names, item) => (names.some((name) => sameExerciseName(name, item.name)) ? names : [...names, item.name]), []);
}

const toRef = (exercise: Exercise): CatalogExerciseRef => ({
  id: exercise.id,
  name: exercise.name,
  muscleGroup: exercise.muscleGroup,
  equipment: exercise.equipment,
  imageUrl: exercise.imageUrl,
});

/**
 * Usa o exercício do catálogo que já tem esse nome; só se não houver, cadastra
 * no catálogo PARTICULAR do profissional (sem GIF). O id é sempre o que a API
 * devolveu. Quem dispara é o profissional — a IA nunca cadastra exercício.
 */
export async function findOrCreateExercise(name: string, muscleGroup: string | null): Promise<CatalogExerciseRef> {
  const sameName = (await api.listExercises(name)).filter((exercise) => sameExerciseName(exercise.name, name));
  // Mais de um com o mesmo nome: fica o que não tem demonstração — nunca se escolhe um GIF pelo profissional.
  const existing = sameName.find((exercise) => !exercise.imageUrl) ?? sameName[0];
  if (existing) return toRef(existing);
  return toRef(await api.createExercise({ name, type: 'strength', scope: 'private', ...(muscleGroup ? { muscleGroup } : {}) }));
}

/**
 * Cadastra (ou reaproveita) cada nome uma única vez e devolve o que deu certo;
 * o que falhar fica de fora, com a mensagem, e os demais seguem.
 */
export async function registerPending(pending: PendingExercise[]): Promise<{ registered: Array<{ item: PendingExercise; exercise: CatalogExerciseRef }>; failed: string[] }> {
  const byName: Array<{ name: string; exercise: CatalogExerciseRef | null }> = [];
  const registered: Array<{ item: PendingExercise; exercise: CatalogExerciseRef }> = [];
  const failed: string[] = [];
  for (const item of pending) {
    let known = byName.find((entry) => sameExerciseName(entry.name, item.name));
    if (!known) {
      known = { name: item.name, exercise: null };
      byName.push(known);
      try {
        known.exercise = await findOrCreateExercise(item.name, item.muscleGroup);
      } catch {
        failed.push(item.name);
      }
    }
    if (known.exercise) registered.push({ item, exercise: known.exercise });
  }
  return { registered, failed };
}

/** Liga os exercícios cadastrados ao rascunho — só onde o profissional ainda não escolheu outro. */
export function applyRegistered(draft: WorkoutDraft, registered: Array<{ item: PendingExercise; exercise: CatalogExerciseRef }>): WorkoutDraft {
  return registered.reduce(
    (current, { item, exercise }) => updateExercise(current, item.dayKey, item.exerciseKey, (target) => (target.exercise ? target : selectExercise(target, exercise))),
    draft,
  );
}
