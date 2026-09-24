export interface CatalogExerciseRef {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  imageUrl: string | null;
}

export type ExerciseMatchStatus = 'matched' | 'ambiguous' | 'not_found';

export interface ExerciseMatch {
  status: ExerciseMatchStatus;
  exercise: CatalogExerciseRef | null;
  /** Sugestões para o profissional escolher — nunca aplicadas automaticamente. */
  candidates: CatalogExerciseRef[];
}

export const MAX_MATCH_CANDIDATES = 5;

const STOPWORDS = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'com', 'na', 'no', 'nas', 'nos', 'em', 'para', 'por', 'ao']);

/** Ignora só forma: acento, caixa e pontuação. "Tríceps-Pulley" ≡ "triceps pulley". */
export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token && !STOPWORDS.has(token));
}

interface IndexedExercise {
  ref: CatalogExerciseRef;
  normalized: string;
  tokens: Set<string>;
}

export type CatalogIndex = IndexedExercise[];

export function buildCatalogIndex(catalog: CatalogExerciseRef[]): CatalogIndex {
  return catalog.map((ref) => {
    const normalized = normalizeExerciseName(ref.name);
    return { ref, normalized, tokens: new Set(significantTokens(normalized)) };
  });
}

function rank(entries: IndexedExercise[], target: string): CatalogExerciseRef[] {
  return [...entries]
    .sort(
      (a, b) =>
        Math.abs(a.normalized.length - target.length) - Math.abs(b.normalized.length - target.length) ||
        a.ref.name.localeCompare(b.ref.name) ||
        a.ref.id.localeCompare(b.ref.id),
    )
    .slice(0, MAX_MATCH_CANDIDATES)
    .map((entry) => entry.ref);
}

/**
 * Conservador de propósito: só um nome IDÊNTICO (a menos de acento/caixa/
 * pontuação) e único no catálogo vira `matched`. Nome contido em outro
 * ("Supino reto" × "Supino reto com barra") nunca é associado sozinho —
 * vira sugestão; duas ou mais possibilidades = `ambiguous`.
 */
export function matchExerciseName(rawName: string, index: CatalogIndex): ExerciseMatch {
  const target = normalizeExerciseName(rawName);
  if (!target) {
    return { status: 'not_found', exercise: null, candidates: [] };
  }

  const exact = index.filter((entry) => entry.normalized === target);
  if (exact.length === 1) {
    return { status: 'matched', exercise: exact[0].ref, candidates: [] };
  }
  if (exact.length > 1) {
    return { status: 'ambiguous', exercise: null, candidates: rank(exact, target) };
  }

  const targetTokens = significantTokens(target);
  if (targetTokens.length === 0) {
    return { status: 'not_found', exercise: null, candidates: [] };
  }
  const targetSet = new Set(targetTokens);
  const partial = index.filter(
    (entry) =>
      entry.tokens.size > 0 &&
      (targetTokens.every((token) => entry.tokens.has(token)) || [...entry.tokens].every((token) => targetSet.has(token))),
  );

  return {
    status: partial.length >= 2 ? 'ambiguous' : 'not_found',
    exercise: null,
    candidates: rank(partial, target),
  };
}
