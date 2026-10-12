import type { ExerciseType } from '../types/api';

const API_MEDIA_PREFIX = '/exercise-media/';

/**
 * Só o caminho relativo da mídia servida pela PRÓPRIA API é buscado com o
 * token do usuário. A checagem é uma allowlist estreita de propósito: uma
 * URL como `//outro-host/x` seria tratada como absoluta pelo axios e
 * enviaria o Authorization para terceiros.
 */
export function isApiMediaPath(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith(API_MEDIA_PREFIX) && url.length > API_MEDIA_PREFIX.length;
}

/** URL absoluta externa (informada pelo profissional) — exibida direto, sem token. */
export function isExternalImageUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export const EXERCISE_TYPES: Array<{ value: ExerciseType; label: string }> = [
  { value: 'strength', label: 'Força / musculação' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobilidade' },
  { value: 'stretching', label: 'Alongamento' },
  { value: 'other', label: 'Outro' },
];

const comparable = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Mesmo nome a menos de acento, caixa e pontuação — a regra que o servidor usa para ligar o texto ao catálogo. */
export function sameExerciseName(a: string, b: string): boolean {
  return comparable(a) !== '' && comparable(a) === comparable(b);
}

export function describeExercise(exercise: { muscleGroup: string | null; equipment: string | null }): string {
  return [exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ');
}
