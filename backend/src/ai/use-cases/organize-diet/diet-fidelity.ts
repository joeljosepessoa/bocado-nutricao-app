import { NutritionUnit } from '@prisma/client';
import { AiOutputValidationError } from '../../ai-errors';
import { FOOD_NAME_STOPWORDS, stem } from '../../../foods/food-name-matching';
import type { AiDayKind, AiDietItem, AiGroup, AiGroupKind, AiOrganizedDiet } from './organized-diet.schema';

/**
 * Conferência DETERMINÍSTICA da saída da IA contra o texto que o profissional
 * colou. A IA só pode reorganizar: todo alimento, quantidade, unidade, dia,
 * refeição, bloco, opção, suplemento e orientação precisa estar escrito no
 * texto original. O que não passar é recusado (nada é devolvido) — nunca
 * "corrigido" pelo backend. O que a IA deixou de fora vira aviso de revisão.
 *
 * v2: cada item é conferido pelo seu trecho MÍNIMO — a quantidade precisa
 * estar colada no alimento certo ("3 claras", não o "2" de "2 ovos" na mesma
 * linha) — e a repetição é contada por item ("2 ovos" pode aparecer tantas
 * vezes quantas está escrito, mesmo em linhas inteiras repetidas).
 */

export const DIET_WARNINGS = {
  quantityMissing: 'Quantidade não informada — revisar.',
  unitAssumed: 'Unidade não escrita — considerada "unidade". Confira.',
  unitUnsupported: (unit: string) => `Unidade "${unit}" não existe no sistema — escolha a unidade.`,
  timeUnrecognized: (time: string) => `Horário "${time}" não reconhecido — revisar.`,
  noteDiscarded: 'Observação reescrita pela IA foi descartada — confira o texto original.',
  usageNotesDiscarded: 'Orientação de uso do dia reescrita pela IA foi descartada — confira o texto original.',
  timingDiscarded: 'Horário/momento do suplemento reescrito pela IA foi descartado — confira o texto original.',
  mealNameMissing: 'Refeição sem título no texto — dê um nome.',
  mealWithoutItems: 'Nenhum alimento identificado nesta refeição.',
  singleChoice: 'Bloco "escolha 1" com uma única opção — confira.',
  uncovered: (line: string) => `Trecho não organizado: "${line}" — revisar.`,
} as const;

export interface CheckedDietItem {
  sourceText: string;
  rawFood: string;
  quantity: number | null;
  quantityMax: number | null;
  freeQuantity: boolean;
  unitText: string | null;
  unit: NutritionUnit | null;
  notes: string | null;
  warnings: string[];
}

export interface CheckedChoice {
  label: string | null;
  items: CheckedDietItem[];
}

export interface CheckedGroup {
  kind: AiGroupKind;
  label: string | null;
  choices: CheckedChoice[];
}

export interface CheckedMeal {
  name: string | null;
  time: string | null;
  notes: string | null;
  groups: CheckedGroup[];
  warnings: string[];
}

export interface CheckedDay {
  label: string | null;
  kind: AiDayKind;
  usageNotes: string | null;
  meals: CheckedMeal[];
  warnings: string[];
}

export interface CheckedSupplement {
  sourceText: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string | null;
  timing: string | null;
  notes: string | null;
  warnings: string[];
}

export interface CheckedDiet {
  days: CheckedDay[];
  supplements: CheckedSupplement[];
  guidelines: string[];
  warnings: string[];
}

/**
 * Forma comparável: sem acento/caixa, pontuação vira espaço, decimal com
 * ponto, número separado de letra ("150g" ≡ "150 g"). Nada além de forma.
 */
export function normalizeDietText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/[^a-z0-9./]+/g, ' ')
    .replace(/(?<!\d)[./]|[./](?!\d)/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

function countPhrase(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  const padded = ` ${haystack} `;
  const target = ` ${needle} `;
  for (;;) {
    const at = padded.indexOf(target, from);
    if (at < 0) return count;
    count += 1;
    from = at + target.length - 1;
  }
}

const NUMBER_WORDS: Record<number, string[]> = {
  1: ['um', 'uma'],
  2: ['dois', 'duas'],
  3: ['tres'],
  4: ['quatro'],
  5: ['cinco'],
  6: ['seis'],
  7: ['sete'],
  8: ['oito'],
  9: ['nove'],
  10: ['dez'],
};

const FRACTIONS: Array<[number, string[]]> = [
  [0.5, ['1/2', 'meia', 'meio']],
  [0.25, ['1/4']],
  [0.75, ['3/4']],
  [1 / 3, ['1/3']],
  [2 / 3, ['2/3']],
  [1.5, ['1 1/2', '1 e 1/2', '1 e meia', '1 e meio', 'uma e meia', 'um e meio']],
];

/** Formas escritas aceitas para um número — só grafias, nunca arredondamento. */
export function quantitySpellings(quantity: number): string[] {
  const spellings = new Set<string>();
  spellings.add(String(quantity));
  if (Number.isInteger(quantity)) {
    for (const word of NUMBER_WORDS[quantity] ?? []) spellings.add(word);
  }
  for (const [value, forms] of FRACTIONS) {
    if (Math.abs(value - quantity) < 1e-9) forms.forEach((form) => spellings.add(form));
  }
  return [...spellings];
}

function quantityWritten(quantity: number, normalizedSource: string): boolean {
  return quantitySpellings(quantity).some((form) => containsPhrase(normalizedSource, form));
}

/** Mesma normalização dos dois lados (número separado de letra etc.), tolerando só plural/singular. */
function stemsOf(text: string): string[] {
  return normalizeDietText(text)
    .split(' ')
    .filter((token) => token && !FOOD_NAME_STOPWORDS.has(token))
    .map(stem);
}

function stemsPresent(text: string, normalizedSource: string): boolean {
  const wanted = stemsOf(text);
  if (wanted.length === 0) return false;
  const available = new Set(normalizedSource.split(' ').map(stem));
  return wanted.every((s) => available.has(s));
}

const UNIT_ALIASES: Array<[NutritionUnit, string[]]> = [
  [NutritionUnit.g, ['g', 'gr', 'grs', 'grama', 'gramas']],
  [NutritionUnit.ml, ['ml', 'mililitro', 'mililitros']],
  [NutritionUnit.slice, ['fatia', 'fatias']],
  [NutritionUnit.cup, ['xicara', 'xicaras', 'xic', 'xicara de cha', 'xicaras de cha']],
  [NutritionUnit.tablespoon, ['colher de sopa', 'colheres de sopa', 'cs', 'col sopa', 'c sopa', 'colher sopa']],
  [NutritionUnit.teaspoon, ['colher de cha', 'colheres de cha', 'cc', 'col cha', 'c cha', 'colher cha']],
  [NutritionUnit.unit, ['unidade', 'unidades', 'un', 'und', 'unid']],
];

/** Só tradução de grafia para o enum do sistema — sem conversão de valor (kg/litro não viram g/ml). */
export function mapUnit(unitText: string | null): NutritionUnit | null {
  if (!unitText) return null;
  const normalized = normalizeDietText(unitText);
  for (const [unit, aliases] of UNIT_ALIASES) {
    if (aliases.includes(normalized)) return unit;
  }
  return null;
}

/** "7h" / "7:30" / "07h30" → "07:00"/"07:30"; o resto não é convertido. */
export function parseMealTime(time: string | null): string | null {
  if (!time) return null;
  const match = /^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)\s*(?:h|hs|min)?$/i.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// --- Trecho mínimo do item (quantidade colada no alimento) -------------------------

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos']);
const RANGE_WORDS = new Set(['a', 'ate', 'e']);
const UNIT_WORDS = new Set([
  ...UNIT_ALIASES.flatMap(([, aliases]) => aliases.flatMap((alias) => alias.split(' '))),
  'kg', 'l', 'litro', 'litros', 'scoop', 'scoops', 'pote', 'potes', 'copo', 'copos', 'concha', 'conchas', 'porcao', 'porcoes',
  'pedaco', 'pedacos', 'cubo', 'cubos', 'capsula', 'capsulas', 'sache', 'saches', 'medida', 'medidas', 'dose', 'doses',
  'punhado', 'punhados', 'pitada', 'pitadas', 'lata', 'latas', 'fio', 'fios', 'ramo', 'ramos', 'dente', 'dentes', 'bife', 'bifes',
  'file', 'files', 'posta', 'postas', 'ponta', 'pontas', 'escumadeira', 'escumadeiras', 'pegador', 'pegadores', 'grande', 'grandes',
  'media', 'medias', 'medio', 'medios', 'pequena', 'pequenas', 'pequeno', 'pequenos', 'cheia', 'cheias', 'rasa', 'rasas',
]);
const FREE_QUANTITY = ['a vontade', 'livre', 'a gosto'];

interface Span {
  start: number;
  end: number;
}

/** Posições do nome do alimento no trecho (raízes na ordem, tolerando palavras no meio). */
function foodSpans(tokens: string[], food: string): Span[] {
  const wanted = stemsOf(food);
  if (wanted.length === 0) return [];
  const stems = tokens.map(stem);
  const spans: Span[] = [];
  stems.forEach((s, i) => {
    if (s !== wanted[0]) return;
    let k = 1;
    let end = i;
    for (let j = i + 1; j < tokens.length && j <= i + 6 && k < wanted.length; j++) {
      if (stems[j] === wanted[k]) {
        k += 1;
        end = j;
      }
    }
    if (k === wanted.length) spans.push({ start: i, end });
  });
  return spans;
}

function matchAt(tokens: string[], at: number, phrase: string[]): boolean {
  return phrase.length > 0 && phrase.every((t, i) => tokens[at + i] === t);
}

/** Só unidade, conector ou número entre a quantidade e o alimento ("1 scoop (30 g) de whey"). */
function bridges(tokens: string[], from: number, to: number, extraUnits: Set<string>): boolean {
  if (to - from > 6) return false;
  for (let j = from; j < to; j++) {
    const t = tokens[j];
    if (!(CONNECTORS.has(t) || UNIT_WORDS.has(t) || extraUnits.has(t) || /^\d+(?:[./]\d+)?$/.test(t))) return false;
  }
  return true;
}

function skipUnits(tokens: string[], from: number, extraUnits: Set<string>): number {
  let j = from;
  while (j < tokens.length && (UNIT_WORDS.has(tokens[j]) || extraUnits.has(tokens[j]))) j += 1;
  return j;
}

/** Fim da quantidade (com o máximo da faixa, se houver) começando em `at`; -1 se não bate. */
function quantityEnd(tokens: string[], at: number, quantity: number, quantityMax: number | null): number {
  for (const spelled of quantitySpellings(quantity)) {
    const q = spelled.split(' ');
    if (!matchAt(tokens, at, q)) continue;
    let j = at + q.length;
    if (quantityMax === null) return j;
    if (RANGE_WORDS.has(tokens[j])) j += 1;
    for (const max of quantitySpellings(quantityMax)) {
      const m = max.split(' ');
      if (matchAt(tokens, j, m)) return j + m.length;
    }
  }
  return -1;
}

/**
 * Trecho mínimo normalizado do item ("3 claras", "10 g de aveia") — ou null
 * se a quantidade escrita não está COLADA no alimento dentro do trecho.
 */
export function itemCore(item: Pick<AiDietItem, 'sourceText' | 'food' | 'quantity' | 'quantityMax' | 'unit' | 'freeQuantity'>): string | null {
  const tokens = normalizeDietText(item.sourceText).split(' ').filter(Boolean);
  const spans = foodSpans(tokens, item.food);
  if (spans.length === 0) return null;
  if (item.quantity === null) {
    const { start, end } = spans[0];
    let last = end;
    if (item.freeQuantity) {
      for (const phrase of FREE_QUANTITY) {
        const p = phrase.split(' ');
        for (let j = end + 1; j <= end + 3 && j < tokens.length; j++) {
          if (matchAt(tokens, j, p)) last = Math.max(last, j + p.length - 1);
        }
      }
    }
    return tokens.slice(start, last + 1).join(' ');
  }
  const extraUnits = new Set(item.unit ? normalizeDietText(item.unit).split(' ') : []);
  for (const span of spans) {
    for (let p = 0; p < tokens.length; p++) {
      const qEnd = quantityEnd(tokens, p, item.quantity, item.quantityMax);
      if (qEnd < 0) continue;
      // "10 g de aveia": quantidade antes do alimento.
      if (qEnd <= span.start && bridges(tokens, qEnd, span.start, extraUnits)) return tokens.slice(p, span.end + 1).join(' ');
      // "arroz 150 g": depois do alimento, só se nada além de unidade vier colado depois ("ovos 3 claras" não vale).
      if (p > span.end && bridges(tokens, span.end + 1, p, extraUnits)) {
        const after = skipUnits(tokens, qEnd, extraUnits);
        const next = tokens[after];
        if (next === undefined || next === 'e' || next === 'mais') return tokens.slice(span.start, after).join(' ');
      }
    }
  }
  return null;
}

// --- Linhas do texto: opção em vigor e segmentos "/" e "ou" ----------------------

interface SourceLine {
  raw: string;
  norm: string;
  /** Partes separadas por "/" ou "ou" — alternativas entre si. */
  segments: string[];
  /** Número da "Opção N" em vigor nesta linha (null fora de opções numeradas). */
  option: number | null;
}

const OPTION_PATTERN = /\bopcao (\d+)\b/;

function sourceLines(input: string): SourceLine[] {
  let current: number | null = null;
  return input.split(/\r?\n/).map((raw) => {
    const norm = normalizeDietText(raw);
    const option = OPTION_PATTERN.exec(norm);
    if (!norm) current = null;
    else if (option) current = Number(option[1]);
    else if (/^\s*\d+\s*[.)-]\s/.test(raw) || (raw === raw.toUpperCase() && /[A-ZÀ-Ý]/.test(raw))) current = null;
    const segments = raw
      .split(/(?<!\d)\/|\/(?!\d)|\s+ou\s+/i)
      .map(normalizeDietText)
      .filter(Boolean);
    return { raw, norm, segments, option: norm ? current : null };
  });
}

const CHOICE_MARKER = /\b(escolh\w*|opcao|opcoes|ou|alternativas?|substitui\w*)\b/;

function hasChoiceMarker(line: SourceLine): boolean {
  return CHOICE_MARKER.test(line.norm) || /(?<!\d)\/|\/(?!\d)/.test(line.raw);
}

/** together: há segmento com os dois; apart: aparecem juntos só em linhas que os separam por "/"/"ou". */
function relation(lines: SourceLine[], a: string, b: string, onlyOnce = false): 'together' | 'apart' | 'unknown' {
  let together = false;
  let apart = false;
  for (const line of lines) {
    if (!containsPhrase(line.norm, a) || !containsPhrase(line.norm, b)) continue;
    if (onlyOnce && (countPhrase(line.norm, a) !== 1 || countPhrase(line.norm, b) !== 1)) continue;
    if (line.segments.length < 2 || line.segments.some((s) => containsPhrase(s, a) && containsPhrase(s, b))) together = true;
    else apart = true;
  }
  return together ? 'together' : apart ? 'apart' : 'unknown';
}

// --- Cobertura ----------------------------------------------------------------------

const COVERAGE_IGNORED = new Set(['e', 'de', 'da', 'do', 'com', 'ou', 'a', 'o', 'as', 'os', 'em', 'para', 'no', 'na', 'nos', 'nas']);
/** Ignorados só numa linha que já teve conteúdo organizado (numeração, "(escolher 1)", títulos de seção). */
const STRUCTURE_WORDS = new Set([
  'escolher', 'escolha', 'opcao', 'opcoes', 'bloco', 'cada', 'refeicao', 'um', 'uma', 'suplementacao', 'suplementos', 'orientacoes',
]);
const SECTION_TITLES = new Set(['suplementacao', 'suplementos', 'orientacoes', 'orientacao', 'orientacoes gerais', 'observacoes', 'dicas']);

function uncoveredLines(input: string, covered: string[]): string[] {
  const phrases = [...new Set(covered.filter(Boolean))].sort((a, b) => b.length - a.length);
  const result: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const normalized = normalizeDietText(rawLine);
    if (!normalized || SECTION_TITLES.has(normalized)) continue;
    let line = ` ${normalized} `;
    let removed = false;
    for (const phrase of phrases) {
      const next = line.split(` ${phrase} `).join('  ');
      if (next !== line) removed = true;
      line = next;
    }
    const leftover = line
      .split(' ')
      .filter((token) => token && !COVERAGE_IGNORED.has(token))
      .filter((token) => !(removed && (/^\d{1,2}$/.test(token) || STRUCTURE_WORDS.has(token))));
    if (leftover.length > 0) {
      const original = rawLine.trim();
      result.push(original.length > 120 ? `${original.slice(0, 117)}...` : original);
    }
  }
  return result;
}

// --- Conferência ----------------------------------------------------------------------

function itemLabel(item: AiDietItem): string {
  return `"${item.sourceText}"`;
}

/**
 * Lança AiOutputValidationError quando a IA inventou/alterou algo (alimento,
 * quantidade, unidade, rótulo, opção/alternativa trocada, orientação ou item
 * repetido além do texto).
 */
export function checkDietFidelity(input: string, organized: AiOrganizedDiet): CheckedDiet {
  const source = normalizeDietText(input);
  const lines = sourceLines(input);
  const problems: string[] = [];
  const covered: string[] = [];
  const coreUse = new Map<string, number>();

  const literal = (text: string | null): string | null => {
    if (!text) return null;
    const normalized = normalizeDietText(text);
    if (!containsPhrase(source, normalized)) return null;
    covered.push(normalized);
    return text;
  };
  const requireLabel = (label: string | null, what: string) => {
    if (label && !literal(label)) problems.push(`${what} "${label}" não está no texto informado.`);
  };

  const checkItem = (item: AiDietItem, at: string): { checked: CheckedDietItem; core: string | null } => {
    const warnings: string[] = [];
    const normalizedSource = normalizeDietText(item.sourceText);
    if (!containsPhrase(source, normalizedSource)) {
      problems.push(`${at}: o trecho ${itemLabel(item)} não está no texto informado.`);
    } else {
      covered.push(normalizedSource);
    }
    if (!stemsPresent(item.food, normalizedSource)) {
      problems.push(`${at}: o alimento "${item.food}" não corresponde ao texto ${itemLabel(item)}.`);
    }

    let core: string | null = null;
    if (item.quantityMax !== null && item.quantity === null) {
      problems.push(`${at}: faixa de quantidade sem o valor mínimo em ${itemLabel(item)}.`);
    } else if (item.quantity !== null && (item.freeQuantity || !quantityWritten(item.quantity, normalizedSource))) {
      problems.push(`${at}: a quantidade ${item.quantity} não está escrita em ${itemLabel(item)}.`);
    } else if (item.quantityMax !== null && !quantityWritten(item.quantityMax, normalizedSource)) {
      problems.push(`${at}: a quantidade máxima ${item.quantityMax} não está escrita em ${itemLabel(item)}.`);
    } else {
      core = itemCore(item);
      if (core === null && item.quantity !== null) {
        problems.push(`${at}: a quantidade ${item.quantity} não está junto de "${item.food}" em ${itemLabel(item)}.`);
      }
    }
    if (core) {
      covered.push(core);
      const used = (coreUse.get(core) ?? 0) + 1;
      coreUse.set(core, used);
      if (used > countPhrase(source, core)) problems.push(`${at}: "${core}" foi usado mais vezes do que aparece no texto.`);
    }

    if (item.freeQuantity && !FREE_QUANTITY.some((phrase) => containsPhrase(normalizedSource, phrase))) {
      problems.push(`${at}: "à vontade" não está escrito em ${itemLabel(item)}.`);
    }
    if (item.quantity === null && !item.freeQuantity) warnings.push(DIET_WARNINGS.quantityMissing);

    let unit: NutritionUnit | null = null;
    if (item.unit) {
      if (!stemsPresent(item.unit, normalizedSource) && !containsPhrase(normalizedSource, normalizeDietText(item.unit))) {
        problems.push(`${at}: a unidade "${item.unit}" não está escrita em ${itemLabel(item)}.`);
      }
      unit = mapUnit(item.unit);
      if (!unit) warnings.push(DIET_WARNINGS.unitUnsupported(item.unit));
    } else if (item.quantity !== null) {
      unit = NutritionUnit.unit;
      warnings.push(DIET_WARNINGS.unitAssumed);
    }

    let notes: string | null = null;
    if (item.notes) {
      notes = literal(item.notes);
      if (!notes) warnings.push(DIET_WARNINGS.noteDiscarded);
    }

    return {
      checked: {
        sourceText: item.sourceText,
        rawFood: item.food,
        quantity: item.freeQuantity ? null : item.quantity,
        quantityMax: item.freeQuantity ? null : item.quantityMax,
        freeQuantity: item.freeQuantity,
        unitText: item.unit,
        unit: item.freeQuantity ? null : unit,
        notes,
        warnings,
      },
      core,
    };
  };

  /** Regras da estrutura contra o texto: opções/alternativas não podem ser misturadas nem viradas obrigatórias. */
  const checkGroupStructure = (group: AiGroup, cores: Array<Array<string | null>>, where: string, mealName: string | null) => {
    const groupName = group.label ? `bloco "${group.label}"` : group.kind === 'meal_options' ? 'opções' : 'itens fixos';
    if (group.kind === 'fixed' && group.choices.length !== 1) problems.push(`${where}: itens fixos devem formar uma única lista.`);
    if (group.kind !== 'fixed' && group.choices.length === 0) problems.push(`${where}: ${groupName} sem nenhuma opção.`);
    group.choices.forEach((choice, c) => {
      if (choice.items.length === 0) problems.push(`${where}: ${choice.label ?? `escolha ${c + 1}`} sem alimentos.`);
    });

    // Itens da MESMA escolha que o texto separa por "/" ou "ou" (alternativa virando obrigatória).
    cores.forEach((choiceCores, c) => {
      const known = [...new Set(choiceCores.filter((x): x is string => !!x))];
      for (let a = 0; a < known.length; a++) {
        for (let b = a + 1; b < known.length; b++) {
          if (relation(lines, known[a], known[b]) === 'apart') {
            problems.push(`${where}: "${known[a]}" e "${known[b]}" são alternativas no texto (separados por "/" ou "ou"), mas foram juntados${group.kind === 'fixed' ? ' como itens fixos' : ` em ${group.choices[c].label ?? 'uma mesma escolha'}`}.`);
          }
        }
      }
    });

    if (group.kind === 'fixed') return;

    // Itens que o texto junta ("frango + azeite") separados em escolhas diferentes.
    // Item presente nas duas escolhas ("2 ovos" na Opção 1 e na 3) não serve de prova.
    for (let c1 = 0; c1 < cores.length; c1++) {
      for (let c2 = c1 + 1; c2 < cores.length; c2++) {
        for (const a of cores[c1]) {
          for (const b of cores[c2]) {
            if (!a || !b || a === b || cores[c2].includes(a) || cores[c1].includes(b)) continue;
            if (relation(lines, a, b, true) === 'together' && relation(lines, a, b) !== 'apart') {
              problems.push(`${where}: "${a}" e "${b}" aparecem juntos no texto, mas foram separados em escolhas diferentes.`);
            }
          }
        }
      }
    }

    // "Opção N": cada item precisa estar numa linha dessa opção (opções misturadas).
    group.choices.forEach((choice, c) => {
      const number = choice.label ? OPTION_PATTERN.exec(normalizeDietText(choice.label)) : null;
      if (!number) return;
      for (const core of cores[c]) {
        if (!core) continue;
        const withCore = lines.filter((line) => containsPhrase(line.norm, core));
        const numbered = withCore.filter((line) => line.option !== null);
        if (numbered.length > 0 && !numbered.some((line) => line.option === Number(number[1]))) {
          problems.push(`${where}: "${core}" não faz parte da ${choice.label} no texto (opções misturadas).`);
        }
      }
    });

    // "Escolher 1" precisa estar indicado no texto (escolher/opção/ou/"/").
    const evidence = lines.filter(
      (line) =>
        cores.some((choiceCores) => choiceCores.some((core) => core && containsPhrase(line.norm, core))) ||
        (group.label && containsPhrase(line.norm, normalizeDietText(group.label))) ||
        (mealName && containsPhrase(line.norm, normalizeDietText(mealName))),
    );
    if (!evidence.some(hasChoiceMarker)) {
      problems.push(`${where}: ${groupName} foi marcado como "escolha 1", mas o texto não indica escolha (escolher, opção, "ou" ou "/").`);
    }
  };

  const totalMeals = organized.days.reduce((sum, d) => sum + d.meals.length, 0);
  let mealNumber = 0;
  const days: CheckedDay[] = organized.days.map((day, d) => {
    const dayWarnings: string[] = [];
    requireLabel(day.label, `Dia ${d + 1}: o dia`);
    let usageNotes: string | null = null;
    if (day.usageNotes) {
      usageNotes = literal(day.usageNotes);
      if (!usageNotes) dayWarnings.push(DIET_WARNINGS.usageNotesDiscarded);
    }

    const meals: CheckedMeal[] = day.meals.map((meal) => {
      mealNumber += 1;
      const where = `Refeição ${mealNumber}${meal.name ? ` (${meal.name})` : ''}`;
      const warnings: string[] = [];
      requireLabel(meal.name, `${where}: a refeição`);
      if (!meal.name) warnings.push(DIET_WARNINGS.mealNameMissing);

      let time: string | null = null;
      if (meal.time) {
        if (!literal(meal.time)) {
          problems.push(`${where}: o horário "${meal.time}" não está no texto informado.`);
        } else {
          time = parseMealTime(meal.time);
          if (!time) warnings.push(DIET_WARNINGS.timeUnrecognized(meal.time));
        }
      }
      let notes: string | null = null;
      if (meal.notes) {
        notes = literal(meal.notes);
        if (!notes) warnings.push(DIET_WARNINGS.noteDiscarded);
      }

      if (meal.groups.some((g) => g.kind === 'meal_options') && meal.groups.length > 1) {
        problems.push(`${where}: refeição com opções completas não pode ter outros blocos.`);
      }

      const groups: CheckedGroup[] = meal.groups.map((group, g) => {
        requireLabel(group.label, `${where}: o bloco`);
        const cores: Array<Array<string | null>> = [];
        const choices: CheckedChoice[] = group.choices.map((choice, c) => {
          requireLabel(choice.label, `${where}: a opção`);
          const results = choice.items.map((item, i) => checkItem(item, `${where}, bloco ${g + 1}, escolha ${c + 1}, alimento ${i + 1}`));
          cores.push(results.map((r) => r.core));
          return { label: choice.label, items: results.map((r) => r.checked) };
        });
        checkGroupStructure(group, cores, where, meal.name);
        if (group.kind === 'alternatives' && group.choices.length === 1) warnings.push(DIET_WARNINGS.singleChoice);
        return { kind: group.kind, label: group.label, choices };
      });

      if (groups.every((g) => g.choices.every((c) => c.items.length === 0))) warnings.push(DIET_WARNINGS.mealWithoutItems);
      return { name: meal.name, time, notes, groups, warnings };
    });
    return { label: day.label, kind: day.kind, usageNotes, meals, warnings: dayWarnings };
  });
  if (totalMeals === 0) problems.push('Nenhuma refeição foi organizada.');

  const supplements: CheckedSupplement[] = organized.supplements.map((s, i) => {
    const at = `Suplemento ${i + 1} (${s.name})`;
    const warnings: string[] = [];
    const normalizedSource = normalizeDietText(s.sourceText);
    if (!containsPhrase(source, normalizedSource)) problems.push(`${at}: o trecho "${s.sourceText}" não está no texto informado.`);
    else covered.push(normalizedSource);
    if (!stemsPresent(s.name, normalizedSource)) problems.push(`${at}: o nome "${s.name}" não corresponde ao texto "${s.sourceText}".`);
    if (s.quantity !== null && !quantityWritten(s.quantity, normalizedSource)) problems.push(`${at}: a quantidade ${s.quantity} não está escrita em "${s.sourceText}".`);
    if (s.quantityMax !== null && (s.quantity === null || !quantityWritten(s.quantityMax, normalizedSource))) {
      problems.push(`${at}: a quantidade máxima ${s.quantityMax} não está escrita em "${s.sourceText}".`);
    }
    if (s.unit && !stemsPresent(s.unit, normalizedSource) && !containsPhrase(normalizedSource, normalizeDietText(s.unit))) {
      problems.push(`${at}: a unidade "${s.unit}" não está escrita em "${s.sourceText}".`);
    }
    let timing: string | null = null;
    if (s.timing) {
      timing = literal(s.timing);
      if (!timing) warnings.push(DIET_WARNINGS.timingDiscarded);
    }
    let notes: string | null = null;
    if (s.notes) {
      notes = literal(s.notes);
      if (!notes) warnings.push(DIET_WARNINGS.noteDiscarded);
    }
    return { sourceText: s.sourceText, name: s.name, quantity: s.quantity, quantityMax: s.quantityMax, unitText: s.unit, timing, notes, warnings };
  });

  // Orientações vão ao PACIENTE: só trecho copiado literalmente — nada reescrito.
  const guidelines = organized.guidelines.filter((text, i) => {
    if (literal(text)) return true;
    problems.push(`Orientação ${i + 1}: "${text.length > 80 ? `${text.slice(0, 77)}...` : text}" não está escrita assim no texto.`);
    return false;
  });

  if (problems.length > 0) {
    const shown = problems.slice(0, 3).join(' ');
    const more = problems.length > 3 ? ` (+${problems.length - 3} problema(s))` : '';
    throw new AiOutputValidationError(
      `A organização foi recusada porque alteraria a dieta escrita: ${shown}${more} Nada foi salvo — tente organizar novamente.`,
    );
  }

  const warnings = [...organized.warnings, ...uncoveredLines(input, covered).map(DIET_WARNINGS.uncovered)];
  return { days, supplements, guidelines, warnings: [...new Set(warnings)] };
}
