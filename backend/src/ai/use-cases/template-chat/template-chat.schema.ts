import { LoadUnit } from '@prisma/client';
import { AiOutputValidationError } from '../../ai-errors';
import { WORKOUT_LIMITS as W } from '../../../workouts/workout-limits';
import {
  AI_DAY_KINDS,
  AI_GROUP_KINDS,
  asArray,
  asObject,
  DIET_LIMITS as D,
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
 * Saída da IA na conversa dos Modelos. A IA responde em texto curto ("reply")
 * e, quando muda o modelo ("changed": true), devolve o modelo INTEIRO de novo
 * citando só referências do contexto ("ref"). Nome de alimento/exercício,
 * calorias e macros nunca vêm dela — o sistema resolve as referências e calcula.
 */

export const CHAT_REPLY_MAX = 2000;
export const CHAT_ITEM_MAX_QUANTITY = 5000;

// --- Dieta ---------------------------------------------------------------------

export interface ChatDietItem {
  ref: string;
  /** g/ml para alimento do catálogo; na unidade do próprio item para referências "X…". null = sem quantidade. */
  quantity: number | null;
  notes: string | null;
}

export interface ChatDietDay {
  label: string | null;
  kind: AiDayKind;
  usageNotes: string | null;
  meals: Array<{
    name: string;
    time: string | null;
    notes: string | null;
    groups: Array<{ kind: AiGroupKind; label: string | null; choices: Array<{ label: string | null; items: ChatDietItem[] }> }>;
  }>;
}

export interface ChatDietOutput {
  reply: string;
  changed: boolean;
  days: ChatDietDay[];
  guidelines: string[];
  warnings: string[];
}

const DIET_ITEM_SCHEMA = strictObject({ ref: { type: 'string' }, quantity: nullable({ type: 'number' }), notes: nullable({ type: 'string' }) });

export const CHAT_DIET_JSON_SCHEMA: Record<string, unknown> = strictObject({
  reply: { type: 'string' },
  changed: { type: 'boolean' },
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
              choices: list(strictObject({ label: nullable({ type: 'string' }), items: list(DIET_ITEM_SCHEMA) })),
            }),
          ),
        }),
      ),
    }),
  ),
  guidelines: list({ type: 'string' }),
  warnings: list({ type: 'string' }),
});

function quantity(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > CHAT_ITEM_MAX_QUANTITY) {
    fail(path, `deve ser número maior que 0 e até ${CHAT_ITEM_MAX_QUANTITY} ou null`);
  }
  return value;
}

function base(text: string, keys: readonly string[]) {
  const root = asObject(extractJson(text), 'resposta', keys);
  if (typeof root.changed !== 'boolean') fail('changed', 'deve ser true/false');
  return { root, reply: requiredString(root.reply, 'reply', CHAT_REPLY_MAX), changed: root.changed };
}

function invalid(error: unknown): never {
  if (error instanceof SchemaError) {
    throw new AiOutputValidationError(`A IA devolveu uma estrutura inválida (${error.path}: ${error.problem}). Tente pedir de novo.`);
  }
  throw error;
}

export function parseChatDiet(text: string): ChatDietOutput {
  try {
    const { root, reply, changed } = base(text, ['reply', 'changed', 'days', 'guidelines', 'warnings']);
    const days = asArray(root.days ?? [], 'days', D.maxDays).map((dayValue, d) => {
      const day = asObject(dayValue, `days[${d}]`, ['label', 'kind', 'usageNotes', 'meals']);
      return {
        label: optionalString(day.label, `days[${d}].label`, D.maxNameLength),
        kind: day.kind === undefined || day.kind === null ? 'other' : oneOf(day.kind, `days[${d}].kind`, AI_DAY_KINDS),
        usageNotes: optionalString(day.usageNotes, `days[${d}].usageNotes`, D.maxNotesLength),
        meals: asArray(day.meals ?? [], `days[${d}].meals`, D.maxMeals).map((mealValue, m) => {
          const mp = `days[${d}].meals[${m}]`;
          const meal = asObject(mealValue, mp, ['name', 'time', 'notes', 'groups']);
          return {
            name: requiredString(meal.name, `${mp}.name`, D.maxNameLength),
            time: optionalString(meal.time, `${mp}.time`, 20),
            notes: optionalString(meal.notes, `${mp}.notes`, D.maxNotesLength),
            groups: asArray(meal.groups ?? [], `${mp}.groups`, D.maxGroupsPerMeal).map((groupValue, g) => {
              const gp = `${mp}.groups[${g}]`;
              const group = asObject(groupValue, gp, ['kind', 'label', 'choices']);
              return {
                kind: oneOf(group.kind, `${gp}.kind`, AI_GROUP_KINDS),
                label: optionalString(group.label, `${gp}.label`, D.maxNameLength),
                choices: asArray(group.choices ?? [], `${gp}.choices`, D.maxChoicesPerGroup).map((choiceValue, c) => {
                  const cp = `${gp}.choices[${c}]`;
                  const choice = asObject(choiceValue, cp, ['label', 'items']);
                  return {
                    label: optionalString(choice.label, `${cp}.label`, D.maxNameLength),
                    items: asArray(choice.items ?? [], `${cp}.items`, D.maxItemsPerChoice).map((itemValue, i) => {
                      const ip = `${cp}.items[${i}]`;
                      const item = asObject(itemValue, ip, ['ref', 'quantity', 'notes']);
                      return {
                        ref: requiredString(item.ref, `${ip}.ref`, 40),
                        quantity: quantity(item.quantity, `${ip}.quantity`),
                        notes: optionalString(item.notes, `${ip}.notes`, D.maxNotesLength),
                      };
                    }),
                  };
                }),
              };
            }),
          };
        }),
      };
    });
    return {
      reply,
      changed,
      days,
      guidelines: stringList(root.guidelines, 'guidelines', D.maxGuidelines, D.maxGuidelineLength),
      warnings: stringList(root.warnings, 'warnings', D.maxWarnings, D.maxWarningLength),
    };
  } catch (error) {
    invalid(error);
  }
}

// --- Treino --------------------------------------------------------------------

export interface ChatWorkoutSet {
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  restSeconds: number | null;
  durationSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface ChatWorkoutOutput {
  reply: string;
  changed: boolean;
  days: Array<{ name: string; notes: string | null; exercises: Array<{ ref: string; notes: string | null; sets: ChatWorkoutSet[] }> }>;
  warnings: string[];
}

export const CHAT_WORKOUT_JSON_SCHEMA: Record<string, unknown> = strictObject({
  reply: { type: 'string' },
  changed: { type: 'boolean' },
  days: list(
    strictObject({
      name: { type: 'string' },
      notes: nullable({ type: 'string' }),
      exercises: list(
        strictObject({
          ref: { type: 'string' },
          notes: nullable({ type: 'string' }),
          sets: list(
            strictObject({
              reps: nullable({ type: 'integer' }),
              repsMin: nullable({ type: 'integer' }),
              repsMax: nullable({ type: 'integer' }),
              loadValue: nullable({ type: 'number' }),
              loadUnit: nullable({ type: 'string', enum: Object.values(LoadUnit) }),
              restSeconds: nullable({ type: 'integer' }),
              durationSeconds: nullable({ type: 'integer' }),
              tempo: nullable({ type: 'string' }),
              notes: nullable({ type: 'string' }),
            }),
          ),
        }),
      ),
    }),
  ),
  warnings: list({ type: 'string' }),
});

function int(value: unknown, path: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(path, `deve ser inteiro entre ${min} e ${max} ou null`);
  return value;
}

function num(value: unknown, path: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `deve ser número entre ${min} e ${max} ou null`);
  return value;
}

export function parseChatWorkout(text: string): ChatWorkoutOutput {
  try {
    const { root, reply, changed } = base(text, ['reply', 'changed', 'days', 'warnings']);
    const days = asArray(root.days ?? [], 'days', W.maxDays).map((dayValue, d) => {
      const day = asObject(dayValue, `days[${d}]`, ['name', 'notes', 'exercises']);
      return {
        name: requiredString(day.name, `days[${d}].name`, W.maxNameLength),
        notes: optionalString(day.notes, `days[${d}].notes`, W.maxNotesLength),
        exercises: asArray(day.exercises ?? [], `days[${d}].exercises`, W.maxExercisesPerDay).map((exValue, e) => {
          const ep = `days[${d}].exercises[${e}]`;
          const ex = asObject(exValue, ep, ['ref', 'notes', 'sets']);
          return {
            ref: requiredString(ex.ref, `${ep}.ref`, 40),
            notes: optionalString(ex.notes, `${ep}.notes`, W.maxNotesLength),
            sets: asArray(ex.sets ?? [], `${ep}.sets`, W.maxSetsPerExercise).map((setValue, s) => {
              const sp = `${ep}.sets[${s}]`;
              const set = asObject(setValue, sp, ['reps', 'repsMin', 'repsMax', 'loadValue', 'loadUnit', 'restSeconds', 'durationSeconds', 'tempo', 'notes']);
              return {
                reps: int(set.reps, `${sp}.reps`, 1, W.maxReps),
                repsMin: int(set.repsMin, `${sp}.repsMin`, 1, W.maxReps),
                repsMax: int(set.repsMax, `${sp}.repsMax`, 1, W.maxReps),
                loadValue: num(set.loadValue, `${sp}.loadValue`, 0, W.maxLoadValue),
                loadUnit: set.loadUnit === undefined || set.loadUnit === null ? null : oneOf(set.loadUnit, `${sp}.loadUnit`, Object.values(LoadUnit)),
                restSeconds: int(set.restSeconds, `${sp}.restSeconds`, 0, W.maxRestSeconds),
                durationSeconds: int(set.durationSeconds, `${sp}.durationSeconds`, 1, W.maxDurationSeconds),
                tempo: optionalString(set.tempo, `${sp}.tempo`, W.maxTempoLength),
                notes: optionalString(set.notes, `${sp}.notes`, W.maxNotesLength),
              };
            }),
          };
        }),
      };
    });
    return { reply, changed, days, warnings: stringList(root.warnings, 'warnings', D.maxWarnings, D.maxWarningLength) };
  } catch (error) {
    invalid(error);
  }
}
