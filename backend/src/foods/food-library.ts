import { normalizeFoodName, stem } from './food-name-matching';

/**
 * Busca da tela "Alimentos": cada palavra digitada precisa aparecer no nome (sem acento/caixa; plural
 * tolerado) — "frango grelhado" acha "Frango, peito, sem pele, grelhado".
 */
export const FOOD_LIBRARY_TACO_SOURCE = 'taco4';
export const FOOD_LIBRARY_NO_GROUP = '__sem_grupo__';

export type FoodOrigin = 'taco' | 'mine' | 'shared';
export type FoodOriginFilter = 'all' | FoodOrigin;

const IGNORED = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'a', 'o', 'em', 'na', 'no']);

export function searchWords(term: string | undefined): string[] {
  return normalizeFoodName(term ?? '')
    .split(' ')
    .filter((w) => w && !IGNORED.has(w))
    .map((w) => (w.length > 3 ? stem(w) : w));
}

export function nameMatches(normalizedName: string, words: string[]): boolean {
  return words.every((w) => normalizedName.includes(w));
}

/** Menor = mais relevante: nome que começa com a 1ª palavra, depois o mais curto. */
export function searchRank(normalizedName: string, words: string[]): number {
  const starts = words.length > 0 && normalizedName.startsWith(words[0]) ? 0 : 1000;
  return starts + normalizedName.length;
}
