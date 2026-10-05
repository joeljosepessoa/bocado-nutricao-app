import { NutritionUnit } from '@prisma/client';
import { AiOutputValidationError } from '../../ai-errors';
import { FOOD_NAME_STOPWORDS, stem } from '../../../foods/food-name-matching';
import type { AiOrganizedDiet } from './organized-diet.schema';

/**
 * Conferência DETERMINÍSTICA da saída da IA contra o texto que o profissional
 * colou. A IA só pode reorganizar: todo alimento, quantidade, unidade,
 * refeição e horário precisa estar escrito no texto original. O que não
 * passar é recusado (nada é devolvido) — nunca "corrigido" pelo backend.
 * O que a IA deixou de fora vira aviso de revisão (nunca some em silêncio).
 */

export const DIET_WARNINGS = {
  quantityMissing: 'Quantidade não informada — revisar.',
  unitAssumed: 'Unidade não escrita — considerada "unidade". Confira.',
  unitUnsupported: (unit: string) => `Unidade "${unit}" não existe no sistema — escolha a unidade.`,
  timeUnrecognized: (time: string) => `Horário "${time}" não reconhecido — revisar.`,
  noteDiscarded: 'Observação reescrita pela IA foi descartada — confira o texto original.',
  mealNameMissing: 'Refeição sem título no texto — dê um nome.',
  mealWithoutItems: 'Nenhum alimento identificado nesta refeição.',
  uncovered: (line: string) => `Trecho não organizado: "${line}" — revisar.`,
} as const;

export interface CheckedDietItem {
  sourceText: string;
  rawFood: string;
  quantity: number | null;
  unitText: string | null;
  unit: NutritionUnit | null;
  notes: string | null;
  warnings: string[];
}

export interface CheckedMeal {
  name: string | null;
  time: string | null;
  notes: string | null;
  items: CheckedDietItem[];
  warnings: string[];
}

export interface CheckedDiet {
  meals: CheckedMeal[];
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
  const plain = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  spellings.add(plain);
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

const COVERAGE_IGNORED = new Set(['e', 'de', 'da', 'do', 'com', 'ou', 'a', 'o', 'as', 'os', 'em', 'para']);

function uncoveredLines(input: string, covered: string[]): string[] {
  const result: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    let line = ` ${normalizeDietText(rawLine)} `;
    if (!line.trim()) continue;
    for (const phrase of covered) {
      if (phrase) line = line.split(` ${phrase} `).join(' ');
    }
    const leftover = line.split(' ').filter((token) => token && !COVERAGE_IGNORED.has(token));
    if (leftover.length > 0) {
      const original = rawLine.trim();
      result.push(original.length > 120 ? `${original.slice(0, 117)}...` : original);
    }
  }
  return result;
}

/**
 * Lança AiOutputValidationError quando a IA inventou/alterou algo (alimento,
 * quantidade, unidade, refeição, horário ou item repetido além do texto).
 */
export function checkDietFidelity(input: string, organized: AiOrganizedDiet): CheckedDiet {
  const source = normalizeDietText(input);
  const problems: string[] = [];
  const covered: string[] = [];
  const sourceUse = new Map<string, number>();

  const meals: CheckedMeal[] = organized.meals.map((meal, m) => {
    const where = `Refeição ${m + 1}`;
    const warnings: string[] = [];

    const mealName = meal.name ? normalizeDietText(meal.name) : '';
    if (meal.name && !containsPhrase(source, mealName)) {
      problems.push(`${where}: a refeição "${meal.name}" não está no texto informado.`);
    }
    if (!meal.name) warnings.push(DIET_WARNINGS.mealNameMissing);
    covered.push(mealName);

    let time: string | null = null;
    if (meal.time) {
      const normalizedTime = normalizeDietText(meal.time);
      if (!containsPhrase(source, normalizedTime)) {
        problems.push(`${where}: o horário "${meal.time}" não está no texto informado.`);
      } else {
        covered.push(normalizedTime);
        time = parseMealTime(meal.time);
        if (!time) warnings.push(DIET_WARNINGS.timeUnrecognized(meal.time));
      }
    }

    let notes: string | null = null;
    if (meal.notes) {
      const normalizedNotes = normalizeDietText(meal.notes);
      if (containsPhrase(source, normalizedNotes)) {
        notes = meal.notes;
        covered.push(normalizedNotes);
      } else {
        warnings.push(DIET_WARNINGS.noteDiscarded);
      }
    }

    const items: CheckedDietItem[] = meal.items.map((item, i) => {
      const at = `${where}, alimento ${i + 1}`;
      const itemWarnings: string[] = [];
      const normalizedSource = normalizeDietText(item.sourceText);

      if (!containsPhrase(source, normalizedSource)) {
        problems.push(`${at}: o trecho "${item.sourceText}" não está no texto informado.`);
      } else {
        const used = (sourceUse.get(normalizedSource) ?? 0) + 1;
        sourceUse.set(normalizedSource, used);
        if (used > countPhrase(source, normalizedSource)) {
          problems.push(`${at}: o trecho "${item.sourceText}" foi usado mais vezes do que aparece no texto.`);
        }
        covered.push(normalizedSource);
      }

      if (!stemsPresent(item.food, normalizedSource)) {
        problems.push(`${at}: o alimento "${item.food}" não corresponde ao texto "${item.sourceText}".`);
      }

      if (item.quantity !== null && !quantityWritten(item.quantity, normalizedSource)) {
        problems.push(`${at}: a quantidade ${item.quantity} não está escrita em "${item.sourceText}".`);
      }
      if (item.quantity === null) itemWarnings.push(DIET_WARNINGS.quantityMissing);

      let unit: NutritionUnit | null = null;
      if (item.unit) {
        if (!stemsPresent(item.unit, normalizedSource) && !containsPhrase(normalizedSource, normalizeDietText(item.unit))) {
          problems.push(`${at}: a unidade "${item.unit}" não está escrita em "${item.sourceText}".`);
        }
        unit = mapUnit(item.unit);
        if (!unit) itemWarnings.push(DIET_WARNINGS.unitUnsupported(item.unit));
      } else if (item.quantity !== null) {
        unit = NutritionUnit.unit;
        itemWarnings.push(DIET_WARNINGS.unitAssumed);
      }

      let itemNotes: string | null = null;
      if (item.notes) {
        const normalizedNotes = normalizeDietText(item.notes);
        if (containsPhrase(source, normalizedNotes)) {
          itemNotes = item.notes;
          covered.push(normalizedNotes);
        } else {
          itemWarnings.push(DIET_WARNINGS.noteDiscarded);
        }
      }

      return { sourceText: item.sourceText, rawFood: item.food, quantity: item.quantity, unitText: item.unit, unit, notes: itemNotes, warnings: itemWarnings };
    });

    if (items.length === 0) warnings.push(DIET_WARNINGS.mealWithoutItems);
    return { name: meal.name, time, notes, items, warnings };
  });

  if (problems.length > 0) {
    const shown = problems.slice(0, 3).join(' ');
    const more = problems.length > 3 ? ` (+${problems.length - 3} problema(s))` : '';
    throw new AiOutputValidationError(
      `A organização foi recusada porque alteraria a dieta escrita: ${shown}${more} Nada foi salvo — tente organizar novamente.`,
    );
  }

  const warnings = [...organized.warnings, ...uncoveredLines(input, covered).map(DIET_WARNINGS.uncovered)];
  return { meals, warnings: [...new Set(warnings)] };
}
