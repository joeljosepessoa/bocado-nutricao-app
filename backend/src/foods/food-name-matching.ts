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

/** Nome escrito → alimento que o PRÓPRIO profissional ligou numa dieta salva. */
export type LearnedLinkIndex = ReadonlyMap<string, CatalogFoodRef>;

/**
 * Chave do que o profissional já ligou: ignora acento, caixa, pontuação e
 * plural ("Ovos inteiros" ≡ "ovo inteiro"), mas mantém "com"/"sem" —
 * "frango sem pele" nunca vira "frango com pele".
 */
export function learnedLinkKey(name: string): string {
  return normalizeFoodName(name).split(' ').filter(Boolean).map(stem).join(' ');
}

export interface SavedFoodLinkRow {
  /** Nome como escrito na dieta (o que o paciente vê). */
  writtenName: string;
  /** Alimento do catálogo ligado, ou null quando o item ficou sem cálculo. */
  foodId: string | null;
  dietVersionId: string;
}

/**
 * Aprende com as dietas que o profissional já salvou. `rows` vem da versão
 * mais recente para a mais antiga; para cada nome só vale a versão mais
 * recente em que ele aparece. Ali, se o nome foi ligado sempre ao mesmo
 * alimento, ele passa a ligar sozinho. Se foi ligado a alimentos diferentes
 * ("fruta" → banana numa opção, maçã noutra) ou não foi ligado, nada é
 * aprendido. Alimento que não está mais visível ao profissional é ignorado.
 */
export function buildLearnedLinkIndex(rows: SavedFoodLinkRow[], visible: ReadonlyMap<string, CatalogFoodRef>): LearnedLinkIndex {
  const latest = new Map<string, { versionId: string; foodIds: Set<string> }>();
  for (const row of rows) {
    const key = learnedLinkKey(row.writtenName);
    if (!key) continue;
    let entry = latest.get(key);
    if (!entry) {
      entry = { versionId: row.dietVersionId, foodIds: new Set() };
      latest.set(key, entry);
    }
    if (entry.versionId !== row.dietVersionId) continue;
    if (row.foodId && visible.has(row.foodId)) entry.foodIds.add(row.foodId);
  }
  const learned = new Map<string, CatalogFoodRef>();
  for (const [key, { foodIds }] of latest) {
    if (foodIds.size === 1) learned.set(key, visible.get([...foodIds][0])!);
  }
  return learned;
}

export function buildFoodCatalogIndex(catalog: CatalogFoodRef[]): FoodCatalogIndex {
  return catalog.map((ref) => ({ ref, normalized: normalizeFoodName(ref.name), stems: new Set(significantStems(ref.name)) }));
}

/**
 * Associação só por uma escolha do próprio profissional numa dieta salva
 * (mesmo nome escrito), por nome IGUAL ao do catálogo (ignorando
 * acento/caixa/pontuação) ou por um apelido aprovado pelo nutricionista
 * (lista do Bocado × TACO). Qualquer outra semelhança vira apenas sugestão —
 * o profissional escolhe. Nunca inventa correspondência: "fruta" não vira
 * "banana".
 */
export function matchFoodName(rawName: string, index: FoodCatalogIndex, aliases?: FoodAliasIndex, learned?: LearnedLinkIndex): FoodMatch {
  // O que o profissional já escolheu para este mesmo nome vale mais que qualquer regra.
  const viaLearned = learned?.get(learnedLinkKey(rawName));
  if (viaLearned) {
    return { status: 'matched', food: viaLearned, candidates: [] };
  }
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
