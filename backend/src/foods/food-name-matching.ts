export interface CatalogFoodRef {
  id: string;
  name: string;
}

export type FoodMatchStatus = 'matched' | 'ambiguous' | 'not_found';

export interface FoodMatch {
  status: FoodMatchStatus;
  food: CatalogFoodRef | null;
  /** Sugestões para o profissional escolher — nunca aplicadas automaticamente. */
  candidates: CatalogFoodRef[];
}

export const MAX_FOOD_CANDIDATES = 5;

export const FOOD_NAME_STOPWORDS: ReadonlySet<string> = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'na', 'no', 'em', 'para', 'ao', 'tipo']);

/** Ignora só forma: acento, caixa e pontuação. "Pão-Integral" ≡ "pao integral". */
export function normalizeFoodName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Raiz curta para tolerar plural/singular ("ovos" ~ "ovo", "claras" ~ "clara") — nunca sinônimo. */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith('oes')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('aes')) return token.slice(0, -3);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function significantStems(text: string): string[] {
  return normalizeFoodName(text)
    .split(' ')
    .filter((token) => token && !FOOD_NAME_STOPWORDS.has(token))
    .map(stem);
}

interface IndexedFood {
  ref: CatalogFoodRef;
  normalized: string;
  stems: Set<string>;
}

export type FoodCatalogIndex = IndexedFood[];

/** Apelido normalizado → alimento (só apelidos que ligam sozinhos, aprovados pelo nutricionista). */
export type FoodAliasIndex = ReadonlyMap<string, CatalogFoodRef>;

export function buildFoodAliasIndex(aliases: { alias: string; food: CatalogFoodRef }[]): FoodAliasIndex {
  return new Map(aliases.map((a) => [normalizeFoodName(a.alias), a.food]));
}

export function buildFoodCatalogIndex(catalog: CatalogFoodRef[]): FoodCatalogIndex {
  return catalog.map((ref) => ({ ref, normalized: normalizeFoodName(ref.name), stems: new Set(significantStems(ref.name)) }));
}

/**
 * Associação só por nome IGUAL (ignorando acento/caixa/pontuação) ou por um
 * apelido aprovado pelo nutricionista (lista do Bocado × TACO). Qualquer
 * outra semelhança vira apenas sugestão — o profissional escolhe. Nunca
 * inventa correspondência: "fruta" não vira "banana".
 */
export function matchFoodName(rawName: string, index: FoodCatalogIndex, aliases?: FoodAliasIndex): FoodMatch {
  const target = normalizeFoodName(rawName);
  const exact = index.filter((entry) => entry.normalized === target);
  if (exact.length === 1) {
    return { status: 'matched', food: exact[0].ref, candidates: [] };
  }
  if (exact.length > 1) {
    return { status: 'ambiguous', food: null, candidates: exact.slice(0, MAX_FOOD_CANDIDATES).map((e) => e.ref) };
  }
  // Apelido aprovado pelo nutricionista ("peito de frango", "arroz branco").
  const viaAlias = aliases?.get(target);
  if (viaAlias) {
    return { status: 'matched', food: viaAlias, candidates: [] };
  }

  const wanted = significantStems(rawName);
  if (wanted.length === 0) {
    return { status: 'not_found', food: null, candidates: [] };
  }
  const scored = index
    .map((entry) => ({ entry, hits: wanted.filter((s) => entry.stems.has(s)).length }))
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits || a.entry.ref.name.length - b.entry.ref.name.length || a.entry.ref.name.localeCompare(b.entry.ref.name));
  const candidates = scored.slice(0, MAX_FOOD_CANDIDATES).map(({ entry }) => entry.ref);
  return { status: candidates.length > 0 ? 'ambiguous' : 'not_found', food: null, candidates };
}
