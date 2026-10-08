import { AiOutputValidationError } from '../../ai-errors';
import {
  AI_DAY_KINDS,
  AI_GROUP_KINDS,
  asArray,
  asObject,
  DIET_LIMITS,
  extractJson,
  fail,
  list,
  nullable,
  oneOf,
  optionalString,
  requiredString,
  SchemaError,
  stringList,
  strictObject,
  type AiDayKind,
  type AiGroupKind,
} from '../organize-diet/organized-diet.schema';

/**
 * Saída do provedor no modo "Deixar a IA montar": a IA só ESCOLHE alimentos
 * do catálogo enviado (pela referência `ref`) e a quantidade na unidade base
 * do alimento (g ou ml). Ela não escreve nome de alimento, não manda calorias
 * nem macros — o sistema resolve a referência e calcula tudo.
 */

/** Maior quantidade aceita por item, em g ou ml. */
export const CREATED_ITEM_MAX_QUANTITY = 2000;

export interface AiCreatedItem {
  /** Referência de um alimento do catálogo enviado no contexto ("T410", "P1a2b3c4d"). */
  ref: string;
  /** Quantidade na unidade base do alimento (g ou ml). */
  quantity: number;
  notes: string | null;
}

export interface AiCreatedChoice {
  label: string | null;
  items: AiCreatedItem[];
}

export interface AiCreatedGroup {
  kind: AiGroupKind;
  label: string | null;
  choices: AiCreatedChoice[];
}

export interface AiCreatedMeal {
  name: string;
  time: string | null;
  notes: string | null;
  groups: AiCreatedGroup[];
}

export interface AiCreatedDay {
  label: string | null;
  kind: AiDayKind;
  usageNotes: string | null;
  meals: AiCreatedMeal[];
}

export interface AiCreatedDiet {
  days: AiCreatedDay[];
  /** Orientações gerais ao paciente propostas pela IA — o profissional revisa. */
  guidelines: string[];
  /** O que a IA não conseguiu atender (ex.: restrição sem alimento no catálogo). */
  warnings: string[];
}

const ITEM_SCHEMA = strictObject({
  ref: { type: 'string' },
  quantity: { type: 'number' },
  notes: nullable({ type: 'string' }),
});

export const CREATED_DIET_JSON_SCHEMA: Record<string, unknown> = strictObject({
  days: list(
    strictObject({
      label: nullable({ type: 'string' }),
      kind: { type: 'string', enum: [...AI_DAY_KINDS] },
      usageNotes: nullable({ type: 'string' }),
      meals: list(
        strictObject({
          name: { type: 'string' },
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
  guidelines: list({ type: 'string' }),
  warnings: list({ type: 'string' }),
});

function parseItem(value: unknown, path: string): AiCreatedItem {
  const obj = asObject(value, path, ['ref', 'quantity', 'notes']);
  const quantity = obj.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > CREATED_ITEM_MAX_QUANTITY) {
    fail(`${path}.quantity`, `deve ser número maior que 0 e até ${CREATED_ITEM_MAX_QUANTITY}`);
  }
  return {
    ref: requiredString(obj.ref, `${path}.ref`, 40),
    quantity,
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
  };
}

function parseChoice(value: unknown, path: string): AiCreatedChoice {
  const obj = asObject(value, path, ['label', 'items']);
  return {
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    items: asArray(obj.items ?? [], `${path}.items`, DIET_LIMITS.maxItemsPerChoice).map((item, i) => parseItem(item, `${path}.items[${i}]`)),
  };
}

function parseGroup(value: unknown, path: string): AiCreatedGroup {
  const obj = asObject(value, path, ['kind', 'label', 'choices']);
  return {
    kind: oneOf(obj.kind, `${path}.kind`, AI_GROUP_KINDS),
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    choices: asArray(obj.choices ?? [], `${path}.choices`, DIET_LIMITS.maxChoicesPerGroup).map((c, i) => parseChoice(c, `${path}.choices[${i}]`)),
  };
}

function parseMeal(value: unknown, path: string): AiCreatedMeal {
  const obj = asObject(value, path, ['name', 'time', 'notes', 'groups']);
  return {
    name: requiredString(obj.name, `${path}.name`, DIET_LIMITS.maxNameLength),
    time: optionalString(obj.time, `${path}.time`, 20),
    notes: optionalString(obj.notes, `${path}.notes`, DIET_LIMITS.maxNotesLength),
    groups: asArray(obj.groups ?? [], `${path}.groups`, DIET_LIMITS.maxGroupsPerMeal).map((g, i) => parseGroup(g, `${path}.groups[${i}]`)),
  };
}

function parseDay(value: unknown, path: string): AiCreatedDay {
  const obj = asObject(value, path, ['label', 'kind', 'usageNotes', 'meals']);
  return {
    label: optionalString(obj.label, `${path}.label`, DIET_LIMITS.maxNameLength),
    kind: obj.kind === undefined || obj.kind === null ? 'other' : oneOf(obj.kind, `${path}.kind`, AI_DAY_KINDS),
    usageNotes: optionalString(obj.usageNotes, `${path}.usageNotes`, DIET_LIMITS.maxNotesLength),
    meals: asArray(obj.meals ?? [], `${path}.meals`, DIET_LIMITS.maxMeals).map((m, i) => parseMeal(m, `${path}.meals[${i}]`)),
  };
}

export function parseCreatedDiet(text: string): AiCreatedDiet {
  const raw = extractJson(text);
  try {
    const root = asObject(raw, 'resposta', ['days', 'guidelines', 'warnings']);
    return {
      days: asArray(root.days, 'days', DIET_LIMITS.maxDays).map((day, i) => parseDay(day, `days[${i}]`)),
      guidelines: stringList(root.guidelines, 'guidelines', DIET_LIMITS.maxGuidelines, DIET_LIMITS.maxGuidelineLength),
      warnings: stringList(root.warnings, 'warnings', DIET_LIMITS.maxWarnings, DIET_LIMITS.maxWarningLength),
    };
  } catch (error) {
    if (error instanceof SchemaError) {
      throw new AiOutputValidationError(`A IA devolveu uma estrutura inválida (${error.path}: ${error.problem}). Tente gerar novamente.`);
    }
    throw error;
  }
}
