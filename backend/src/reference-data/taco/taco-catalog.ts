import { createHash } from 'crypto';
import { NutrientSituation, TacoDataset, TacoFood, TacoNutrient, TACO_REFERENCE_PORTION, TACO_SOURCE } from './taco-parser';

/**
 * Registro do catálogo oficial derivado de UM alimento da TACO 4ª edição. Nada
 * é convertido: um marcador da TACO (Tr, NA, *, vazio) vira `null` no campo
 * numérico e continua registrado, com a célula bruta, em `macros`/`nutrientes`.
 * Nunca vira 0.
 */

/** Valor gravado em `foods.source` para os alimentos deste importador. */
export const TACO_CATALOG_SOURCE = 'taco4' as const;
/** Chave estável da fonte: edição + número do alimento na TACO. */
export const tacoSourceKey = (numero: number) => `${TACO_CATALOG_SOURCE}:${numero}`;

/** Colunas da TACO que viram campos próprios do alimento. */
export const MACRO_COLUMNS = {
  kcal: 'energia_kcal',
  proteina: 'proteina',
  carboidrato: 'carboidrato',
  lipideos: 'lipideos',
  fibra: 'fibra_alimentar',
  sodio: 'sodio',
} as const;
export type MacroKey = keyof typeof MACRO_COLUMNS;
/** As quatro que o cálculo da dieta usa hoje como obrigatórias. */
export const REQUIRED_MACROS: MacroKey[] = ['kcal', 'proteina', 'carboidrato', 'lipideos'];

export interface TacoCatalogRecord {
  sourceKey: string;
  source: typeof TACO_CATALOG_SOURCE;
  sourceEdition: string;
  sourceNumber: number;
  /** Nome EXATO da planilha. */
  name: string;
  foodGroup: string;
  preparation: string | null;
  baseUnit: 'g';
  referencePortion: string;
  /** Situação e célula bruta de cada campo principal (fonte da verdade). */
  macros: Record<MacroKey, TacoNutrient>;
  /** Projeção numérica: o número da TACO, ou null quando a TACO traz marcador. */
  values: Record<MacroKey, number | null>;
  /** Todas as colunas da aba principal, com situação e célula bruta. */
  nutrients: Record<string, TacoNutrient>;
  fattyAcids: Record<string, TacoNutrient> | null;
  aminoAcids: Record<string, TacoNutrient> | null;
  /** Origem na planilha (aba e linha) para rastreio. */
  origin: { sheet: string; row: number };
  /** Hash do conteúdo acima: a reimportação só atualiza quando ele muda. */
  contentHash: string;
}

/** JSON com chaves ordenadas, para o hash não depender da ordem de inserção. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function toCatalogRecord(food: TacoFood): TacoCatalogRecord {
  const macros = Object.fromEntries(
    (Object.keys(MACRO_COLUMNS) as MacroKey[]).map((k) => [k, food.nutrientes[MACRO_COLUMNS[k]]]),
  ) as Record<MacroKey, TacoNutrient>;
  const values = Object.fromEntries(
    (Object.keys(macros) as MacroKey[]).map((k) => [k, macros[k].situacao === 'valor' ? macros[k].valor : null]),
  ) as Record<MacroKey, number | null>;
  const content = {
    sourceKey: tacoSourceKey(food.numero),
    source: TACO_CATALOG_SOURCE,
    sourceEdition: TACO_SOURCE,
    sourceNumber: food.numero,
    name: food.nome,
    foodGroup: food.grupo,
    preparation: food.preparacao,
    baseUnit: 'g' as const,
    referencePortion: TACO_REFERENCE_PORTION,
    macros,
    values,
    nutrients: food.nutrientes,
    fattyAcids: food.acidosGraxos,
    aminoAcids: food.aminoacidos,
    origin: { sheet: food.origem.aba, row: food.origem.linha },
  };
  return { ...content, contentHash: createHash('sha256').update(canonical(content)).digest('hex') };
}

export const buildTacoCatalog = (dataset: TacoDataset): TacoCatalogRecord[] => dataset.alimentos.map(toCatalogRecord);

const MARKERS: Exclude<NutrientSituation, 'valor'>[] = ['traco', 'nao_aplicavel', 'em_reavaliacao', 'nao_analisado', 'invalido'];

export interface TacoCatalogStats {
  registros: number;
  /** kcal, proteína, carboidrato e lipídeos numéricos. */
  macrosObrigatoriosNumericos: number;
  /** Os 6 campos principais (+ fibra e sódio) numéricos. */
  principaisNumericos: number;
  /** Todas as colunas da aba principal numéricas. */
  todasAsColunasNumericas: number;
  /** Registros com pelo menos um marcador em qualquer coluna da aba principal. */
  comMarcador: number;
  /** Registros com marcador em kcal/proteína/carboidrato/lipídeos. */
  comMarcadorNosObrigatorios: number;
  /** Por marcador: em quantos registros aparece e em quantas células. */
  porMarcador: Record<Exclude<NutrientSituation, 'valor'>, { registros: number; celulas: number }>;
}

export function catalogStats(records: TacoCatalogRecord[]): TacoCatalogStats {
  const numeric = (n: TacoNutrient) => n.situacao === 'valor';
  const porMarcador = Object.fromEntries(MARKERS.map((m) => [m, { registros: 0, celulas: 0 }])) as TacoCatalogStats['porMarcador'];
  for (const r of records) {
    const cells = Object.values(r.nutrients);
    for (const m of MARKERS) {
      const count = cells.filter((c) => c.situacao === m).length;
      porMarcador[m].celulas += count;
      if (count) porMarcador[m].registros += 1;
    }
  }
  return {
    registros: records.length,
    macrosObrigatoriosNumericos: records.filter((r) => REQUIRED_MACROS.every((k) => numeric(r.macros[k]))).length,
    principaisNumericos: records.filter((r) => Object.values(r.macros).every(numeric)).length,
    todasAsColunasNumericas: records.filter((r) => Object.values(r.nutrients).every(numeric)).length,
    comMarcador: records.filter((r) => Object.values(r.nutrients).some((c) => !numeric(c))).length,
    comMarcadorNosObrigatorios: records.filter((r) => REQUIRED_MACROS.some((k) => !numeric(r.macros[k]))).length,
    porMarcador,
  };
}
