import { LoadUnit } from '@prisma/client';
import { AiOutputValidationError } from '../../ai-errors';
import { WORKOUT_LIMITS } from '../../../workouts/workout-limits';
import { repsPrescriptionProblem } from '../../../workouts/workout-set-reps';

/** Formato que o provedor deve devolver — "setGroups" com `count` evita repetir séries iguais. */
export interface AiSetGroup {
  count: number;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface AiExercise {
  name: string;
  muscleGroup: string | null;
  notes: string | null;
  setGroups: AiSetGroup[];
  warnings: string[];
}

export interface AiDay {
  name: string | null;
  notes: string | null;
  exercises: AiExercise[];
}

export interface AiOrganizedWorkout {
  days: AiDay[];
  warnings: string[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const strictObject = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/**
 * Mesmo formato de AiOrganizedWorkout, como JSON Schema para a saída
 * estruturada do provedor. Limites numéricos/de tamanho não entram aqui
 * (não suportados por ela) — ficam em parseOrganizedWorkout, que valida
 * tudo de novo no backend.
 */
export const ORGANIZED_WORKOUT_JSON_SCHEMA: Record<string, unknown> = strictObject({
  days: {
    type: 'array',
    items: strictObject({
      name: nullable({ type: 'string' }),
      notes: nullable({ type: 'string' }),
      exercises: {
        type: 'array',
        items: strictObject({
          name: { type: 'string' },
          muscleGroup: nullable({ type: 'string' }),
          notes: nullable({ type: 'string' }),
          setGroups: {
            type: 'array',
            items: strictObject({
              count: { type: 'integer' },
              reps: nullable({ type: 'integer' }),
              repsMin: nullable({ type: 'integer' }),
              repsMax: nullable({ type: 'integer' }),
              restSeconds: nullable({ type: 'integer' }),
              loadValue: nullable({ type: 'number' }),
              loadUnit: nullable({ type: 'string', enum: Object.values(LoadUnit) }),
              durationSeconds: nullable({ type: 'integer' }),
              distanceMeters: nullable({ type: 'number' }),
              tempo: nullable({ type: 'string' }),
              notes: nullable({ type: 'string' }),
            }),
          },
          warnings: { type: 'array', items: { type: 'string' } },
        }),
      },
    }),
  },
  warnings: { type: 'array', items: { type: 'string' } },
});

const MAX_WARNINGS = 10;
const MAX_WARNING_LENGTH = 300;
const LOAD_UNITS = Object.values(LoadUnit) as string[];

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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'deve ser um objeto');
  }
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).find((key) => !allowedKeys.includes(key));
  if (unknown) {
    fail(`${path}.${unknown}`, 'campo desconhecido');
  }
  return obj;
}

function asArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, 'deve ser uma lista');
  }
  if (value.length > max) {
    fail(path, `no máximo ${max} itens`);
  }
  return value;
}

/** Campo ausente conta como null ("não informado") — tipo errado nunca. */
function optionalString(value: unknown, path: string, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(path, 'deve ser texto ou null');
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    fail(path, `no máximo ${maxLength} caracteres`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(value: unknown, path: string, maxLength: number): string {
  const result = optionalString(value, path, maxLength);
  if (result === null) {
    fail(path, 'obrigatório');
  }
  return result;
}

function optionalInt(value: unknown, path: string, min: number, max: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(path, `deve ser inteiro entre ${min} e ${max} ou null`);
  }
  return value;
}

function optionalNumber(value: unknown, path: string, min: number, max: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `deve ser número entre ${min} e ${max} ou null`);
  }
  return value;
}

function warningList(value: unknown, path: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const items = asArray(value, path, MAX_WARNINGS);
  return items.map((item, i) => requiredString(item, `${path}[${i}]`, MAX_WARNING_LENGTH));
}

function parseSetGroup(value: unknown, path: string): AiSetGroup {
  const obj = asObject(value, path, [
    'count',
    'reps',
    'repsMin',
    'repsMax',
    'restSeconds',
    'loadValue',
    'loadUnit',
    'durationSeconds',
    'distanceMeters',
    'tempo',
    'notes',
  ]);
  const L = WORKOUT_LIMITS;
  const count = optionalInt(obj.count, `${path}.count`, 1, L.maxSetsPerExercise);
  if (count === null) {
    fail(`${path}.count`, 'obrigatório');
  }
  const loadUnit = obj.loadUnit === undefined || obj.loadUnit === null ? null : obj.loadUnit;
  if (loadUnit !== null && (typeof loadUnit !== 'string' || !LOAD_UNITS.includes(loadUnit))) {
    fail(`${path}.loadUnit`, `deve ser um de ${LOAD_UNITS.join(', ')} ou null`);
  }

  const group: AiSetGroup = {
    count,
    reps: optionalInt(obj.reps, `${path}.reps`, 1, L.maxReps),
    repsMin: optionalInt(obj.repsMin, `${path}.repsMin`, 1, L.maxReps),
    repsMax: optionalInt(obj.repsMax, `${path}.repsMax`, 1, L.maxReps),
    restSeconds: optionalInt(obj.restSeconds, `${path}.restSeconds`, 0, L.maxRestSeconds),
    loadValue: optionalNumber(obj.loadValue, `${path}.loadValue`, 0, L.maxLoadValue),
    loadUnit: loadUnit as LoadUnit | null,
    durationSeconds: optionalInt(obj.durationSeconds, `${path}.durationSeconds`, 1, L.maxDurationSeconds),
    distanceMeters: optionalNumber(obj.distanceMeters, `${path}.distanceMeters`, 0, L.maxDistanceMeters),
    tempo: optionalString(obj.tempo, `${path}.tempo`, L.maxTempoLength),
    notes: optionalString(obj.notes, `${path}.notes`, L.maxNotesLength),
  };

  const repsProblem = repsPrescriptionProblem(group);
  if (repsProblem) {
    fail(path, repsProblem);
  }
  return group;
}

function parseExercise(value: unknown, path: string): AiExercise {
  const obj = asObject(value, path, ['name', 'muscleGroup', 'notes', 'setGroups', 'warnings']);
  const L = WORKOUT_LIMITS;
  const setGroups = asArray(obj.setGroups ?? [], `${path}.setGroups`, L.maxSetsPerExercise).map((g, i) =>
    parseSetGroup(g, `${path}.setGroups[${i}]`),
  );
  const totalSets = setGroups.reduce((sum, g) => sum + g.count, 0);
  if (totalSets > L.maxSetsPerExercise) {
    fail(`${path}.setGroups`, `no máximo ${L.maxSetsPerExercise} séries por exercício`);
  }
  return {
    name: requiredString(obj.name, `${path}.name`, L.maxNameLength),
    muscleGroup: optionalString(obj.muscleGroup, `${path}.muscleGroup`, L.maxNameLength),
    notes: optionalString(obj.notes, `${path}.notes`, L.maxNotesLength),
    setGroups,
    warnings: warningList(obj.warnings, `${path}.warnings`),
  };
}

function parseDay(value: unknown, path: string): AiDay {
  const obj = asObject(value, path, ['name', 'notes', 'exercises']);
  const L = WORKOUT_LIMITS;
  return {
    name: optionalString(obj.name, `${path}.name`, L.maxNameLength),
    notes: optionalString(obj.notes, `${path}.notes`, L.maxNotesLength),
    exercises: asArray(obj.exercises ?? [], `${path}.exercises`, L.maxExercisesPerDay).map((e, i) =>
      parseExercise(e, `${path}.exercises[${i}]`),
    ),
  };
}

/** Tolera só embrulho de formatação (cerca de código, texto antes/depois) — o conteúdo é validado inteiro depois. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
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

export function parseOrganizedWorkout(text: string): AiOrganizedWorkout {
  const raw = extractJson(text);
  try {
    const root = asObject(raw, 'resposta', ['days', 'warnings']);
    const days = asArray(root.days, 'days', WORKOUT_LIMITS.maxDays).map((d, i) => parseDay(d, `days[${i}]`));
    return { days, warnings: warningList(root.warnings, 'warnings') };
  } catch (error) {
    if (error instanceof SchemaError) {
      throw new AiOutputValidationError(
        `A IA devolveu uma estrutura inválida (${error.path}: ${error.problem}). Tente organizar novamente.`,
      );
    }
    throw error;
  }
}
