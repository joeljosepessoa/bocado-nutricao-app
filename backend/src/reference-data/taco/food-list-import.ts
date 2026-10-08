import { FoodListMappingStatus } from '@prisma/client';
import { normalizeFoodName } from '../../foods/food-name-matching';

/**
 * Lista de alimentos do Bocado × TACO: grava as escolhas APROVADAS pelo
 * nutricionista (`data/lista-bocado-escolhas.json`) em `food_list_mappings` e
 * os apelidos de busca em `food_aliases`. Idempotente e nunca apaga nada.
 *
 * Um apelido só liga sozinho (`autoLink`) quando o item foi ligado a uma linha
 * da TACO e o apelido não aponta para alimentos diferentes em itens diferentes.
 * Itens "rótulo", "nenhum" e "não incluir" ficam registrados, sem alimento.
 */

export type ListChoice = 'taco' | 'fora_rotulo' | 'nenhum' | 'nao_incluir';

export interface FoodListChoiceItem {
  grupo: string;
  item: string;
  status_original: FoodListMappingStatus;
  escolha: ListChoice;
  taco_numero: number | null;
  taco_nome: string | null;
  nota: string | null;
  candidatos: number[];
  apelidos: string[];
}

export interface FoodListChoiceFile {
  fonte: string;
  aprovado_em: string;
  itens: FoodListChoiceItem[];
}

export const tacoKey = (n: number) => `taco4:${n}`;

const CHOICE_LABEL: Record<ListChoice, string> = {
  taco: 'Linha da TACO',
  fora_rotulo: 'Cadastrar fora da TACO, com valores de rótulo',
  nenhum: 'Nenhuma linha da TACO serve (fica sem cálculo)',
  nao_incluir: 'Não incluir no catálogo',
};

export interface PlannedMapping {
  listGroup: string;
  listItemName: string;
  status: FoodListMappingStatus;
  foodId: string | null;
  candidateKeys: string[];
  notes: string;
  decidedAt: Date;
}

export interface PlannedAlias {
  alias: string;
  /** Item da lista dono do apelido ("grupo|item"). */
  mappingKey: string;
  foodId: string | null;
  autoLink: boolean;
}

export interface FoodListPlan {
  mappings: PlannedMapping[];
  aliases: PlannedAlias[];
  /** Apelidos que apontariam para alimentos diferentes: registrados sem ligar sozinhos. */
  conflictingAliases: string[];
}

export const mappingKey = (m: { listGroup: string; listItemName: string }) => `${m.listGroup}|${m.listItemName}`;

/**
 * Monta o que deve existir no banco. Falha (sem gravar nada) se uma escolha
 * aponta para um nº da TACO que não está no catálogo.
 */
export function planFoodList(file: FoodListChoiceFile, foodIdByKey: ReadonlyMap<string, string>): FoodListPlan {
  const decidedAt = new Date(`${file.aprovado_em}T12:00:00.000Z`);
  if (Number.isNaN(decidedAt.getTime())) throw new Error(`aprovado_em inválido: ${file.aprovado_em}`);

  const missing: string[] = [];
  const mappings: PlannedMapping[] = [];
  const seen = new Set<string>();
  for (const item of file.itens) {
    let foodId: string | null = null;
    if (item.escolha === 'taco') {
      if (item.taco_numero == null) throw new Error(`"${item.item}": escolha TACO sem número`);
      foodId = foodIdByKey.get(tacoKey(item.taco_numero)) ?? null;
      if (!foodId) missing.push(`${item.item} → ${tacoKey(item.taco_numero)}`);
    }
    const planned: PlannedMapping = {
      listGroup: item.grupo,
      listItemName: item.item,
      status: item.status_original,
      foodId,
      candidateKeys: item.candidatos.map(tacoKey),
      notes: [CHOICE_LABEL[item.escolha], item.nota].filter(Boolean).join('. '),
      decidedAt,
    };
    const key = mappingKey(planned);
    if (seen.has(key)) throw new Error(`item repetido na lista: ${key}`);
    seen.add(key);
    mappings.push(planned);
  }
  if (missing.length) throw new Error(`Alimentos da TACO ausentes no catálogo (rode a importação da TACO antes): ${missing.join('; ')}`);

  // Apelido normalizado → itens que o usam (o mesmo apelido pode estar em dois grupos).
  const byAlias = new Map<string, { mapping: PlannedMapping; foodId: string | null }[]>();
  file.itens.forEach((item, i) => {
    const mapping = mappings[i];
    const forms = new Set([item.item, ...item.apelidos].map(normalizeFoodName).filter(Boolean));
    for (const alias of forms) byAlias.set(alias, [...(byAlias.get(alias) ?? []), { mapping, foodId: mapping.foodId }]);
  });

  const aliases: PlannedAlias[] = [];
  const conflictingAliases: string[] = [];
  for (const [alias, owners] of [...byAlias.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const foods = new Set(owners.map((o) => o.foodId));
    const single = foods.size === 1 ? owners[0].foodId : null;
    if (foods.size > 1) conflictingAliases.push(alias);
    aliases.push({ alias, mappingKey: mappingKey(owners[0].mapping), foodId: single, autoLink: single !== null });
  }
  return { mappings, aliases, conflictingAliases };
}

// --- Gravação ---------------------------------------------------------------

export interface StoredMapping extends PlannedMapping {
  id: string;
}

export interface StoredAlias {
  alias: string;
  mappingId: string | null;
  foodId: string | null;
  autoLink: boolean;
}

export interface FoodListStore {
  foodIdsByKey(keys: string[]): Promise<Map<string, string>>;
  listMappings(): Promise<StoredMapping[]>;
  listAliases(): Promise<StoredAlias[]>;
  /** Aplica tudo de uma vez (transação no banco real). */
  apply(changes: { createMappings: PlannedMapping[]; updateMappings: StoredMapping[]; upsertAliases: PlannedAlias[] }): Promise<void>;
}

export interface FoodListImportReport {
  itens: { criados: number; atualizados: number; semMudanca: number };
  apelidos: { criados: number; atualizados: number; semMudanca: number; ligamSozinhos: number };
  apelidosEmConflito: string[];
}

const sameMapping = (a: PlannedMapping, b: PlannedMapping) =>
  a.status === b.status &&
  a.foodId === b.foodId &&
  a.notes === b.notes &&
  a.decidedAt.getTime() === b.decidedAt.getTime() &&
  a.candidateKeys.join(',') === b.candidateKeys.join(',');

export async function importFoodList(store: FoodListStore, file: FoodListChoiceFile): Promise<FoodListImportReport> {
  const keys = [...new Set(file.itens.flatMap((i) => [...i.candidatos, ...(i.taco_numero != null ? [i.taco_numero] : [])]).map(tacoKey))];
  const plan = planFoodList(file, await store.foodIdsByKey(keys));

  const existing = new Map((await store.listMappings()).map((m) => [mappingKey(m), m]));
  const createMappings: PlannedMapping[] = [];
  const updateMappings: StoredMapping[] = [];
  let unchangedMappings = 0;
  for (const m of plan.mappings) {
    const current = existing.get(mappingKey(m));
    if (!current) createMappings.push(m);
    else if (!sameMapping(current, m)) updateMappings.push({ ...m, id: current.id });
    else unchangedMappings++;
  }

  // Apelido idêntico ao gravado (mesmo item, alimento e autoLink) não é regravado.
  const storedAliases = new Map((await store.listAliases()).map((a) => [a.alias, a]));
  const mappingIdByKey = new Map([...existing.values()].map((m) => [mappingKey(m), m.id]));
  const upsertAliases: PlannedAlias[] = [];
  let createdAliases = 0;
  let updatedAliases = 0;
  for (const a of plan.aliases) {
    const stored = storedAliases.get(a.alias);
    if (!stored) {
      createdAliases++;
      upsertAliases.push(a);
    } else if (stored.foodId !== a.foodId || stored.autoLink !== a.autoLink || stored.mappingId !== (mappingIdByKey.get(a.mappingKey) ?? null)) {
      updatedAliases++;
      upsertAliases.push(a);
    }
  }

  if (createMappings.length || updateMappings.length || upsertAliases.length) {
    await store.apply({ createMappings, updateMappings, upsertAliases });
  }
  return {
    itens: { criados: createMappings.length, atualizados: updateMappings.length, semMudanca: unchangedMappings },
    apelidos: {
      criados: createdAliases,
      atualizados: updatedAliases,
      semMudanca: plan.aliases.length - createdAliases - updatedAliases,
      ligamSozinhos: plan.aliases.filter((a) => a.autoLink).length,
    },
    apelidosEmConflito: plan.conflictingAliases,
  };
}
