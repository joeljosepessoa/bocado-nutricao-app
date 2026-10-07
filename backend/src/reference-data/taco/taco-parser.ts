import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';
import { CellValue, readWorkbook, SheetRow } from './xlsx-reader';

/**
 * Representação local da TACO (Tabela Brasileira de Composição de Alimentos,
 * 4ª edição, NEPA/Unicamp) lida da planilha oficial. Nada é inventado nem
 * completado: o nome original é preservado exatamente, cada valor guarda a
 * célula BRUTA, e os marcadores da TACO ("Tr", "NA", "*", vazio) viram uma
 * situação explícita — nunca um número.
 */

export const TACO_SOURCE = 'TACO 4ª edição';
/** A TACO expressa tudo por 100 g de parte comestível. */
export const TACO_REFERENCE_PORTION = '100 g de parte comestível';

export type NutrientSituation =
  | 'valor'
  /** "Tr": traço (abaixo do limite de quantificação/arredondamento). */
  | 'traco'
  /** "NA": não aplicável. */
  | 'nao_aplicavel'
  /** "*": análise sendo reavaliada pela TACO. */
  | 'em_reavaliacao'
  /** Célula vazia: análise não solicitada. */
  | 'nao_analisado'
  /** Texto que não é número nem marcador da legenda — mantido para revisão. */
  | 'invalido';

export interface TacoNutrient {
  valor: number | null;
  situacao: NutrientSituation;
  bruto: CellValue;
}

export interface TacoColumn {
  chave: string;
  rotulo: string;
  unidade: string | null;
}

export interface TacoFood {
  /** "Número do Alimento" na TACO — identificador do registro original. */
  numero: number;
  /** Nome EXATO da planilha (inclusive espaços e grafias originais). */
  nome: string;
  /** Auxiliar de busca (sem acento, minúsculo); nunca substitui `nome`. */
  nomeNormalizado: string;
  grupo: string;
  /** Preparação/estado extraído da descrição ("cozido", "cru", "grelhada"…), ou null. */
  preparacao: string | null;
  porcaoReferencia: string;
  fonte: string;
  origem: { aba: string; linha: number };
  nutrientes: Record<string, TacoNutrient>;
  acidosGraxos: Record<string, TacoNutrient> | null;
  aminoacidos: Record<string, TacoNutrient> | null;
}

export interface TacoDataset {
  fonte: string;
  arquivo: { nome: string; bytes: number; sha256: string };
  abas: Array<{ nome: string; alimentos: number; colunas: TacoColumn[] }>;
  grupos: Array<{ nome: string; alimentos: number }>;
  alimentos: TacoFood[];
  inconsistencias: string[];
}

export function normalizeFoodText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREPARATION =
  /^(crua?s?|cozid[oa]s?( 10 ?minutos)?|cozido com sal|grelhad[oa]s?|assad[oa]s?|frit[oa]s?|refogad[oa]s?|torrad[oa]s?( salgad[oa])?|pre cozid[oa]|saute|a milanesa|enlatad[oa]|drenad[oa]|congelad[oa]|(em )?conserva( em oleo)?|(em )?calda|suco( concentrado)?|polpa|po|infusao \d+%|fluido|fresc[oa])$/;

/**
 * Segmentos da descrição que indicam preparação/estado — "Frango, peito, sem
 * pele, grelhado" → "grelhado". Só um auxiliar: a descrição original continua
 * sendo a referência.
 */
export function extractPreparation(name: string): string | null {
  const found = name
    .split(',')
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => part && PREPARATION.test(normalizeFoodText(part)));
  return found.length ? found.join(', ') : null;
}

function classify(raw: CellValue): TacoNutrient {
  if (typeof raw === 'number') return { valor: raw, situacao: 'valor', bruto: raw };
  if (raw === null) return { valor: null, situacao: 'nao_analisado', bruto: null };
  const text = raw.trim();
  if (text === '') return { valor: null, situacao: 'nao_analisado', bruto: raw };
  if (text === 'Tr') return { valor: null, situacao: 'traco', bruto: raw };
  if (text === 'NA') return { valor: null, situacao: 'nao_aplicavel', bruto: raw };
  if (text === '*') return { valor: null, situacao: 'em_reavaliacao', bruto: raw };
  return { valor: null, situacao: 'invalido', bruto: raw };
}

const slug = (text: string) => normalizeFoodText(text).replace(/ /g, '_').replace(/%/g, 'pct');

/**
 * Cabeçalho em até 3 linhas ("Carbo-" / "idrato" / "(g)"): rótulo = linhas 1+2,
 * unidade = linha 3. Coluna sem rótulo próprio herda o da anterior (kcal/kJ).
 */
function columnsOf(header: SheetRow[]): Array<TacoColumn & { index: number }> {
  const [top, mid, unitRow] = header.map((r) => r.cells);
  const width = Math.max(top.length, mid.length, unitRow.length);
  const columns: Array<TacoColumn & { index: number }> = [];
  let previous = '';
  for (let c = 2; c < width; c++) {
    const a = typeof top[c] === 'string' ? (top[c] as string).trim() : '';
    const b = typeof mid[c] === 'string' ? (mid[c] as string).trim() : '';
    const unit = typeof unitRow[c] === 'string' ? (unitRow[c] as string).trim() : null;
    if (b === 'Número do' || unitRow[c] === 'Alimento') continue; // número repetido no meio da tabela
    let label = a ? (a.endsWith('-') ? `${a.slice(0, -1)}${b}` : `${a} ${b}`.trim()) : b;
    if (!label && unit) label = previous;
    if (!label) continue;
    previous = label;
    columns.push({ index: c, chave: slug(label), rotulo: label, unidade: unit ? unit.replace(/[()]/g, '') : null });
  }
  // Rótulo repetido (Energia kcal/kJ): a unidade entra na chave.
  const repeated = new Set(columns.map((c) => c.chave).filter((key, i, all) => all.indexOf(key) !== i));
  for (const col of columns) {
    if (repeated.has(col.chave)) col.chave = `${col.chave}_${slug(col.unidade ?? String(col.index))}`;
  }
  return columns;
}

const isFoodRow = (r: SheetRow) => typeof r.cells[0] === 'number' && typeof r.cells[1] === 'string';
const filled = (r: SheetRow) => r.cells.filter((c) => c !== null && !(typeof c === 'string' && c.trim() === ''));

export function parseTaco(path: string): TacoDataset {
  const workbook = readWorkbook(path);
  const buffer = readFileSync(path);
  const inconsistencias: string[] = [];
  const abas: TacoDataset['abas'] = [];

  const sheetFoods = workbook.sheetNames.map((sheetName, s) => {
    const rows = workbook.sheet(s);
    const header = rows.filter((r) => r.row <= 3);
    const columns = columnsOf(header);
    const foods = new Map<number, { nome: string; grupo: string; linha: number; valores: Record<string, TacoNutrient> }>();
    let grupo = '';
    let legend = false;
    for (const r of rows) {
      if (r.row <= 3 || legend) continue;
      const cells = filled(r);
      if (isFoodRow(r)) {
        const numero = r.cells[0] as number;
        const nome = r.cells[1] as string;
        const valores: Record<string, TacoNutrient> = {};
        for (const col of columns) {
          const value = classify(r.cells[col.index] ?? null);
          valores[col.chave] = value;
          if (value.situacao === 'invalido') inconsistencias.push(`${sheetName}, linha ${r.row} (nº ${numero} ${nome.trim()}): valor inválido em "${col.rotulo}": ${JSON.stringify(value.bruto)}.`);
        }
        const repeated = r.cells.find((_, i) => i > 1 && header[1]?.cells[i] === 'Número do');
        if (typeof repeated === 'number' && repeated !== numero) inconsistencias.push(`${sheetName}, linha ${r.row}: número repetido ${repeated} difere de ${numero}.`);
        if (foods.has(numero)) inconsistencias.push(`${sheetName}: número de alimento ${numero} repetido (linha ${r.row}).`);
        foods.set(numero, { nome, grupo, linha: r.row, valores });
        continue;
      }
      if (cells.length === 1 && typeof r.cells[0] === 'string') {
        const text = (r.cells[0] as string).trim();
        if (text === 'Legenda') {
          legend = true;
          continue;
        }
        if (!/^(Número do|Alimento)$/.test(text)) grupo = text;
        continue;
      }
      if (cells.length === 1 && typeof r.cells[0] === 'number') {
        inconsistencias.push(`${sheetName}, linha ${r.row}: célula solta com o valor ${r.cells[0]} (sem alimento).`);
      }
    }
    abas.push({ nome: sheetName, alimentos: foods.size, colunas: columns.map(({ chave, rotulo, unidade }) => ({ chave, rotulo, unidade })) });
    return foods;
  });

  const [main, fatty, amino] = sheetFoods;
  const mainSheet = workbook.sheetNames[0];
  // Abas extras só se juntam quando número E nome batem — a de aminoácidos tem
  // número que aponta para outro alimento (herança de outra edição).
  const extraOf = (extra: typeof main | undefined, numero: number, nome: string) => {
    const found = extra?.get(numero);
    return found && normalizeFoodText(found.nome) === normalizeFoodText(nome) ? found.valores : null;
  };
  const alimentos: TacoFood[] = [...main.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, f]) => {
      if (f.nome !== f.nome.trim() || /\s{2,}/.test(f.nome)) inconsistencias.push(`nº ${numero}: nome com espaços extras ${JSON.stringify(f.nome)} (preservado como está).`);
      if (normalizeFoodText(f.nome).length <= 2) inconsistencias.push(`nº ${numero}: nome suspeito ${JSON.stringify(f.nome)} (grupo "${f.grupo}") — parece truncado na planilha.`);
      return {
        numero,
        nome: f.nome,
        nomeNormalizado: normalizeFoodText(f.nome),
        grupo: f.grupo,
        preparacao: extractPreparation(f.nome),
        porcaoReferencia: TACO_REFERENCE_PORTION,
        fonte: TACO_SOURCE,
        origem: { aba: mainSheet, linha: f.linha },
        nutrientes: f.valores,
        acidosGraxos: extraOf(fatty, numero, f.nome),
        aminoacidos: extraOf(amino, numero, f.nome),
      };
    });

  for (const [extra, label] of [
    [fatty, workbook.sheetNames[1]],
    [amino, workbook.sheetNames[2]],
  ] as const) {
    if (!extra) continue;
    for (const [numero, f] of extra) {
      const base = main.get(numero);
      if (!base) inconsistencias.push(`${label}: nº ${numero} não existe na aba principal.`);
      else if (normalizeFoodText(base.nome) !== normalizeFoodText(f.nome)) {
        inconsistencias.push(`${label}: nº ${numero} tem nome diferente (${JSON.stringify(f.nome)} × ${JSON.stringify(base.nome)} na aba principal) — dados desta aba NÃO foram associados.`);
      }
    }
  }
  if (workbook.sheetNames.some((n) => /taco ?3/i.test(n))) {
    inconsistencias.push(`As abas se chamam ${workbook.sheetNames.map((n) => `"${n}"`).join(', ')} ("taco3") embora o arquivo seja da 4ª edição.`);
  }

  const grupos = [...new Set(alimentos.map((a) => a.grupo))].map((nome) => ({ nome, alimentos: alimentos.filter((a) => a.grupo === nome).length }));
  return {
    fonte: TACO_SOURCE,
    arquivo: { nome: basename(path), bytes: statSync(path).size, sha256: createHash('sha256').update(buffer).digest('hex') },
    abas,
    grupos,
    alimentos,
    inconsistencias,
  };
}
