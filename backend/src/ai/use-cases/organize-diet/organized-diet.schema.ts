import { AiOutputValidationError } from '../../ai-errors';

export const DIET_LIMITS = {
  maxDays: 7,
  maxMeals: 20,
  maxGroupsPerMeal: 10,
  maxChoicesPerGroup: 20,
  maxItemsPerChoice: 30,
  maxItemsPerMeal: 50,
  maxSupplements: 30,
  maxGuidelines: 40,
  maxGuidelineLength: 1000,
  maxNameLength: 160,
  maxSourceTextLength: 400,
  maxNotesLength: 500,
  maxUnitLength: 60,
  maxQuantity: 100_000,
  maxWarnings: 20,
  maxWarningLength: 300,
} as const;

export const AI_DAY_KINDS = ['training', 'rest', 'other'] as const;
export const AI_GROUP_KINDS = ['fixed', 'meal_options', 'alternatives'] as const;
export type AiDayKind = (typeof AI_DAY_KINDS)[number];
export type AiGroupKind = (typeof AI_GROUP_KINDS)[number];

/** Um alimento como o provedor deve devolver: tudo copiado do texto, nada calculado. */
export interface AiDietItem {
  /** Trecho MÍNIMO do texto original de onde o item saiu ("3 claras") — base da conferência. */
  sourceText: string;
  /** Nome do alimento como escrito (sem trocar por outro alimento). */
  food: string;
  quantity: number | null;
  /** Faixa "3 a 5 g": quantity = 3, quantityMax = 5. */
  quantityMax: number | null;
  /** Unidade como escrita ("g", "fatias", "colher de sopa") ou null se não escrita. */
  unit: string | null;
  /** "à vontade" escrito no texto. */
  freeQuantity: boolean;
  notes: string | null;
}

export interface AiChoice {
  /** "Opção 1" como escrito; null quando o texto não nomeia a escolha. */
  label: string | null;
  items: AiDietItem[];
}

export interface AiGroup {
  /** fixed = tudo é consumido; meal_options = opções completas; alternatives = bloco "escolher 1". */
  kind: AiGroupKind;
  /** Nome do bloco como escrito ("Carboidrato"); null se não houver. */
  label: string | null;
  choices: AiChoice[];
}

export interface AiMeal {
  /** Nome da refeição como escrito no texto (null se o texto não tem cabeçalho). */
  name: string | null;
  time: string | null;
  notes: string | null;
  groups: AiGroup[];
}

export interface AiDay {
  /** "DIA DE TREINO" como escrito; null quando o texto não separa tipos de dia. */
  label: string | null;
  kind: AiDayKind;
  usageNotes: string | null;
  meals: AiMeal[];
}

export interface AiSupplement {
  sourceText: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  /** Texto livre ("g", "cápsula"). */
  unit: string | null;
  timing: string | null;
  notes: string | null;
}

export interface AiOrganizedDiet {
  days: AiDay[];
  supplements: AiSupplement[];
  /** Orientações ao paciente — trechos copiados literalmente. */
  guidelines: string[];
  warnings: string[];
}

export const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const strictObject = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const list = (items: Record<string, unknown>) => ({ type: 'array', items });

const ITEM_SCHEMA = strictObject({
  sourceText: { type: 'string' },
  food: { type: 'string' },
  quantity: nullable({ type: 'number' }),
  quantityMax: nullable({ type: 'number' }),
  unit: nullable({ type: 'string' }),
  freeQuantity: { type: 'boolean' },
  notes: nullable({ type: 'string' }),
});

/** Mesmo formato de AiOrganizedDiet para a saída estruturada do provedor; o backend valida tudo de novo. */
export const ORGANIZED_DIET_JSON_SCHEMA: Record<string, unknown> = strictObject({
  days: list(
    strictObject({
      label: nullable({ type: 'string' }),
      kind: { type: 'string', enum: [...AI_DAY_KINDS] },
      usageNotes: nullable({ type: 'string' }),
      meals: list(
        strictObject({
          name: nullable({ type: 'string' }),
          time: nullable({ type: 'string' }),
          notes: nullable({ type: 'string' }),
          groups: list(
            strictObject({
              kind: { type: 'string', enum: [...AI_GROUP_KINDS] },
              label: nullable({ type: 'string' }),
              choices: list(strictObject({ label: nullable({ type: 'string' }), items: list(ITEM_SCHEMA) })),
            }),
          ),
        }),
      ),
    }),
  ),
  supplements: list(
    strictObject({
      sourceText: { type: 'string' },
      name: { type: 'string' },
      quantity: nullable({ type: 'number' }),
      quantityMax: nullable({ type: 'number' }),
      unit: nullable({ type: 'string' }),
      timing: nullable({ type: 'string' }),
      notes: nullable({ type: 'string' }),
    }),
  ),
  guidelines: list({ type: 'string' }),
  warnings: list({ type: 'string' }),
});

export class SchemaError extends Error {
  constructor(
    readonly path: string,
    readonly problem: string,
  ) {
    super(`${path}: ${problem}`);
  }
}

export function fail(path: string, problem: string): never {
  throw new SchemaError(path, problem);
}

export function asObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'deve ser um objeto');
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).find((key) => !allowedKeys.includes(key));
  if (unknown) fail(`${path}.${unknown}`, 'campo desconhecido');
  return obj;
}

export function asArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'deve ser uma lista');
  if (value.length > max) fail(path, `no máximo ${max} itens`);
  return value;
}

export function optionalString(value: unknown, path: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(path, 'deve ser texto ou null');
  const trimmed = value.trim();
  if (trimmed.length > maxLength) fail(path, `no máximo ${maxLength} caracteres`);
  return trimmed.length > 0 ? trimmed : null;
}

export function requiredString(value: unknown, path: string, maxLength: number): string {
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

export function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(path, `deve ser um de: ${allowed.join(', ')}`);
  return value as T;
}

export function stringList(value: unknown, path: string, max: number, maxLength: number): string[] {
  if (value === undefined || value === null) return [];
  return asArray(value, path, max).map((item, i) => requiredString(item, `${path}[${i}]`, maxLength));
}

function parseItem(value: unknown, path: string): AiDietItem {
  const obj = asObject(value, path, ['sourceText', 'food', 'quantity', 'quantityMax', 'unit', 'freeQuantity', 'notes']);
  if (obj.freeQuantity !== undefined && obj.freeQuantity !== null && typeof obj.freeQuantity !== 'boolean') fail(`${path}.freeQuantity`, 'deve ser true/false');
  return {
    sourceText: requiredString(obj.sourceText, `${path}.sourceText`, DIET_LIMITS.maxSourceTextLength),
    food: requiredString(obj.food, `${path}.food`, DIET_LIMITS.maxNameLength),
    quantity: optionalQuantity(obj.quantity, `${path}.quantity`),
    quantityMax: optionalQuantity(obj.quantityMax, `${path}.quantityMax`),
    unit: optionalString(obj.unit, `${path}.unit`, DIET_LIMITS.maxUnitLength),
    freeQuantity: obj.freeQuantity === true,
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
  };
}

function parseChoice(value: unknown, path: string): AiChoice {
  const obj = asObject(value, path, ['label', 'items']);
  return {
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    items: asArray(obj.items ?? [], `${path}.items`, DIET_LIMITS.maxItemsPerChoice).map((item, i) => parseItem(item, `${path}.items[${i}]`)),
  };
}

function parseGroup(value: unknown, path: string): AiGroup {
  const obj = asObject(value, path, ['kind', 'label', 'choices']);
  return {
    kind: oneOf(obj.kind, `${path}.kind`, AI_GROUP_KINDS),
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    choices: asArray(obj.choices ?? [], `${path}.choices`, DIET_LIMITS.maxChoicesPerGroup).map((c, i) => parseChoice(c, `${path}.choices[${i}]`)),
  };
}

function parseMeal(value: unknown, path: string): AiMeal {
  const obj = asObject(value, path, ['name', 'time', 'notes', 'groups']);
  return {
    name: optionalString(obj.name, `${path}.name`, DIET_LIMITS.maxNameLength),
    time: optionalString(obj.time, `${path}.time`, 20),
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
    groups: asArray(obj.groups ?? [], `${path}.groups`, DIET_LIMITS.maxGroupsPerMeal).map((g, i) => parseGroup(g, `${path}.groups[${i}]`)),
  };
}

function parseDay(value: unknown, path: string): AiDay {
  const obj = asObject(value, path, ['label', 'kind', 'usageNotes', 'meals']);
  return {
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    kind: obj.kind === undefined || obj.kind === null ? 'other' : oneOf(obj.kind, `${path}.kind`, AI_DAY_KINDS),
    usageNotes: optionalString(obj.usageNotes, `${path}.usageNotes`, DIET_LIMITS.maxNotesLength),
    meals: asArray(obj.meals ?? [], `${path}.meals`, DIET_LIMITS.maxMeals).map((m, i) => parseMeal(m, `${path}.meals[${i}]`)),
  };
}

function parseSupplement(value: unknown, path: string): AiSupplement {
  const obj = asObject(value, path, ['sourceText', 'name', 'quantity', 'quantityMax', 'unit', 'timing', 'notes']);
  return {
    sourceText: requiredString(obj.sourceText, `${path}.sourceText`, DIET_LIMITS.maxSourceTextLength),
    name: requiredString(obj.name, `${path}.name`, DIET_LIMITS.maxNameLength),
    quantity: optionalQuantity(obj.quantity, `${path}.quantity`),
    quantityMax: optionalQuantity(obj.quantityMax, `${path}.quantityMax`),
    unit: optionalString(obj.unit, `${path}.unit`, DIET_LIMITS.maxUnitLength),
    timing: optionalString(obj.timing, `${path}.timing`, DIET_LIMITS.maxNameLength),
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
  };
}

/** Tolera só embrulho de formatação (cerca de código, texto antes/depois) — o conteúdo é validado inteiro depois. */
export function extractJson(text: string): unknown {
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
    const root = asObject(raw, 'resposta', ['days', 'supplements', 'guidelines', 'warnings']);
    return {
      days: asArray(root.days, 'days', DIET_LIMITS.maxDays).map((day, i) => parseDay(day, `days[${i}]`)),
      supplements: asArray(root.supplements ?? [], 'supplements', DIET_LIMITS.maxSupplements).map((s, i) => parseSupplement(s, `supplements[${i}]`)),
      guidelines: stringList(root.guidelines, 'guidelines', DIET_LIMITS.maxGuidelines, DIET_LIMITS.maxGuidelineLength),
      warnings: stringList(root.warnings, 'warnings', DIET_LIMITS.maxWarnings, DIET_LIMITS.maxWarningLength),
    };
  } catch (error) {
    if (error instanceof SchemaError) {
      throw new AiOutputValidationError(`A IA devolveu uma estrutura inválida (${error.path}: ${error.problem}). Tente organizar novamente.`);
    }
    throw error;
  }
}
