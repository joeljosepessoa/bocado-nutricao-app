import { AiOutputValidationError } from '../../ai-errors';

export const DIET_LIMITS = {
  maxMeals: 20,
  maxItemsPerMeal: 50,
  maxNameLength: 160,
  maxSourceTextLength: 400,
  maxNotesLength: 500,
  maxUnitLength: 60,
  maxQuantity: 100_000,
  maxWarnings: 10,
  maxWarningLength: 300,
} as const;

/** Um alimento como o provedor deve devolver: tudo copiado do texto, nada calculado. */
export interface AiDietItem {
  /** Trecho EXATO do texto original de onde o item saiu — base da conferência de fidelidade. */
  sourceText: string;
  /** Nome do alimento como escrito (sem trocar por outro alimento). */
  food: string;
  quantity: number | null;
  /** Unidade como escrita ("g", "fatias", "colher de sopa") ou null se não escrita. */
  unit: string | null;
  notes: string | null;
}

export interface AiMeal {
  /** Nome da refeição como escrito no texto (null se o texto não tem cabeçalho). */
  name: string | null;
  time: string | null;
  notes: string | null;
  items: AiDietItem[];
}

export interface AiOrganizedDiet {
  meals: AiMeal[];
  warnings: string[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const strictObject = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/** Mesmo formato de AiOrganizedDiet para a saída estruturada do provedor; o backend valida tudo de novo. */
export const ORGANIZED_DIET_JSON_SCHEMA: Record<string, unknown> = strictObject({
  meals: {
    type: 'array',
    items: strictObject({
      name: nullable({ type: 'string' }),
      time: nullable({ type: 'string' }),
      notes: nullable({ type: 'string' }),
      items: {
        type: 'array',
        items: strictObject({
          sourceText: { type: 'string' },
          food: { type: 'string' },
          quantity: nullable({ type: 'number' }),
          unit: nullable({ type: 'string' }),
          notes: nullable({ type: 'string' }),
        }),
      },
    }),
  },
  warnings: { type: 'array', items: { type: 'string' } },
});

class SchemaError extends Error {
  constructor(
    readonly path: string,
    readonly problem: string,
  ) {
    super(`${path}: ${problem}`);
  }
}

function fail(path: string, problem: string): never {
  throw new SchemaError(path, problem);
}

function asObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'deve ser um objeto');
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).find((key) => !allowedKeys.includes(key));
  if (unknown) fail(`${path}.${unknown}`, 'campo desconhecido');
  return obj;
}

function asArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'deve ser uma lista');
  if (value.length > max) fail(path, `no máximo ${max} itens`);
  return value;
}

function optionalString(value: unknown, path: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(path, 'deve ser texto ou null');
  const trimmed = value.trim();
  if (trimmed.length > maxLength) fail(path, `no máximo ${maxLength} caracteres`);
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(value: unknown, path: string, maxLength: number): string {
  const result = optionalString(value, path, maxLength);
  if (result === null) fail(path, 'obrigatório');
  return result;
}

function optionalQuantity(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > DIET_LIMITS.maxQuantity) {
    fail(path, `deve ser número maior que 0 e até ${DIET_LIMITS.maxQuantity} ou null`);
  }
  return value;
}

function warningList(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  return asArray(value, path, DIET_LIMITS.maxWarnings).map((item, i) => requiredString(item, `${path}[${i}]`, DIET_LIMITS.maxWarningLength));
}

function parseItem(value: unknown, path: string): AiDietItem {
  const obj = asObject(value, path, ['sourceText', 'food', 'quantity', 'unit', 'notes']);
  return {
    sourceText: requiredString(obj.sourceText, `${path}.sourceText`, DIET_LIMITS.maxSourceTextLength),
    food: requiredString(obj.food, `${path}.food`, DIET_LIMITS.maxNameLength),
    quantity: optionalQuantity(obj.quantity, `${path}.quantity`),
    unit: optionalString(obj.unit, `${path}.unit`, DIET_LIMITS.maxUnitLength),
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
  };
}

function parseMeal(value: unknown, path: string): AiMeal {
  const obj = asObject(value, path, ['name', 'time', 'notes', 'items']);
  return {
    name: optionalString(obj.name, `${path}.name`, DIET_LIMITS.maxNameLength),
    time: optionalString(obj.time, `${path}.time`, 20),
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
    items: asArray(obj.items ?? [], `${path}.items`, DIET_LIMITS.maxItemsPerMeal).map((item, i) => parseItem(item, `${path}.items[${i}]`)),
  };
}

/** Tolera só embrulho de formatação (cerca de código, texto antes/depois) — o conteúdo é validado inteiro depois. */
function extractJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // cai no erro abaixo
      }
    }
  }
  throw new AiOutputValidationError('A IA devolveu um formato inválido (não é JSON). Tente organizar novamente.');
}

export function parseOrganizedDiet(text: string): AiOrganizedDiet {
  const raw = extractJson(text);
  try {
    const root = asObject(raw, 'resposta', ['meals', 'warnings']);
    return {
      meals: asArray(root.meals, 'meals', DIET_LIMITS.maxMeals).map((meal, i) => parseMeal(meal, `meals[${i}]`)),
      warnings: warningList(root.warnings, 'warnings'),
    };
  } catch (error) {
    if (error instanceof SchemaError) {
      throw new AiOutputValidationError(`A IA devolveu uma estrutura inválida (${error.path}: ${error.problem}). Tente organizar novamente.`);
    }
    throw error;
  }
}
