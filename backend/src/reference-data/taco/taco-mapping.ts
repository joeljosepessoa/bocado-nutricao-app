import { stem } from '../../foods/food-name-matching';
import { BOCADO_FOOD_LIST, BocadoFoodGroup, BocadoFoodRule } from './bocado-food-list';
import { normalizeFoodText, TacoFood } from './taco-parser';

/**
 * Mapeamento LOCAL da lista do Bocado para a TACO. Não escolhe nada sozinho:
 * só é "encontrado" quando há exatamente UM candidato por nome direto (sem
 * sinônimo e sem ressalva). Mais de um candidato, sinônimo ou ressalva →
 * "precisa_revisao". Produto de marca/suplemento → "fora_da_taco", sem valores.
 */

export type MappingStatus = 'encontrado' | 'precisa_revisao' | 'nao_encontrado' | 'fora_da_taco';

export interface TacoCandidate {
  numero: number;
  nome: string;
}

export interface MappingRow {
  alimento_bocado: string;
  grupo: string;
  /** Nome oficial da TACO quando há um único candidato; null nos demais casos. */
  candidato_taco: string | null;
  candidatos: TacoCandidate[];
  status: MappingStatus;
  observacao: string;
}

export interface AliasEntry {
  /** Forma normalizada procurada (ex.: "ovos", "arroz branco"). */
  alias: string;
  alimento_bocado: string;
  status: MappingStatus;
  candidatos: TacoCandidate[];
  /** Só true quando o status é "encontrado": um único alimento TACO, sem ambiguidade. */
  ligar_automaticamente: boolean;
}

const headOf = (food: TacoFood) => normalizeFoodText(food.nome.split(',')[0]);
const stemsOf = (text: string) => new Set(normalizeFoodText(text).split(' ').filter(Boolean).map(stem));

export function findCandidates(rule: BocadoFoodRule, foods: TacoFood[]): TacoCandidate[] {
  if (rule.numeros) return foods.filter((f) => rule.numeros!.includes(f.numero)).map(({ numero, nome }) => ({ numero, nome }));
  const heads = rule.head ? [rule.head].flat().map(normalizeFoodText) : null;
  const all = (rule.all ?? []).map((w) => stem(normalizeFoodText(w)));
  const none = (rule.none ?? []).map((w) => stem(normalizeFoodText(w)));
  return foods
    .filter((food) => {
      if (heads && !heads.includes(headOf(food))) return false;
      const stems = stemsOf(food.nome);
      return all.every((w) => stems.has(w)) && !none.some((w) => stems.has(w));
    })
    .map(({ numero, nome }) => ({ numero, nome }));
}

export function mapRule(rule: BocadoFoodRule, grupo: string, foods: TacoFood[]): MappingRow {
  const base = { alimento_bocado: rule.nome, grupo };
  if (rule.foraDaTaco) {
    return { ...base, candidato_taco: null, candidatos: [], status: 'fora_da_taco', observacao: rule.obs ?? 'Fora da TACO.' };
  }
  const candidatos = findCandidates(rule, foods);
  const notes = [rule.revisar, rule.sinonimo, rule.obs].filter((n): n is string => !!n);
  if (candidatos.length === 0) {
    return { ...base, candidato_taco: null, candidatos, status: 'nao_encontrado', observacao: notes.join(' ') || 'Nenhum alimento correspondente na TACO.' };
  }
  const single = candidatos.length === 1 ? candidatos[0].nome : null;
  if (candidatos.length > 1 || rule.sinonimo || rule.revisar || rule.numeros) {
    const many = candidatos.length > 1 ? `${candidatos.length} preparações/variações possíveis na TACO — escolha uma.` : '';
    return { ...base, candidato_taco: single, candidatos, status: 'precisa_revisao', observacao: [many, ...notes].filter(Boolean).join(' ') };
  }
  return { ...base, candidato_taco: single, candidatos, status: 'encontrado', observacao: notes.join(' ') };
}

export function mapBocadoList(foods: TacoFood[], list: BocadoFoodGroup[] = BOCADO_FOOD_LIST): MappingRow[] {
  return list.flatMap((group) => group.itens.map((rule) => mapRule(rule, group.grupo, foods)));
}

/** Formas extras de busca (singular/plural) — nunca criam correspondência nova, só repetem a do item. */
function variants(name: string): string[] {
  const base = normalizeFoodText(name);
  const forms = new Set([base]);
  for (const part of base.split('/').map((p) => p.trim())) forms.add(part);
  if (base.endsWith('s')) forms.add(base.slice(0, -1));
  else forms.add(`${base}s`);
  return [...forms].filter(Boolean);
}

/** Apelidos de busca a partir do mapeamento (+ extras pedidos, ex.: "banana"). Alias ambíguo nunca liga sozinho. */
export function buildAliases(rows: MappingRow[], foods: TacoFood[], extras: BocadoFoodRule[] = EXTRA_ALIASES): AliasEntry[] {
  const entries = new Map<string, AliasEntry>();
  const add = (row: MappingRow) => {
    for (const alias of variants(row.alimento_bocado)) {
      const existing = entries.get(alias);
      if (existing) {
        const sameTarget = JSON.stringify(existing.candidatos) === JSON.stringify(row.candidatos) && existing.status === row.status;
        if (!sameTarget) {
          // Mesmo apelido apontando para coisas diferentes → nunca liga sozinho.
          entries.set(alias, { ...existing, status: 'precisa_revisao', ligar_automaticamente: false, candidatos: [...existing.candidatos, ...row.candidatos] });
        }
        continue;
      }
      entries.set(alias, {
        alias,
        alimento_bocado: row.alimento_bocado,
        status: row.status,
        candidatos: row.candidatos,
        ligar_automaticamente: row.status === 'encontrado',
      });
    }
  };
  rows.forEach(add);
  extras.forEach((rule) => add(mapRule(rule, 'apelidos extras', foods)));
  return [...entries.values()].sort((a, b) => a.alias.localeCompare(b.alias));
}

/** Buscas genéricas citadas como exemplo ("banana", "ovo"…), que não são itens da lista. */
export const EXTRA_ALIASES: BocadoFoodRule[] = [{ nome: 'Banana', head: 'banana' }, { nome: 'Ovo', head: 'ovo', all: ['galinha', 'inteiro'] }];
