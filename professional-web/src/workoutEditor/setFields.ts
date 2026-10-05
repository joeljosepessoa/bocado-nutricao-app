import type { WorkoutSetInput } from '../api/endpoints';
import type { WorkoutSet } from '../types/api';

/** Campos de uma série como o profissional digita no editor. */
export interface SetForm {
  reps: string;
  load: string;
  rest: string;
}

export function setToForm(set: Pick<WorkoutSet, 'reps' | 'repsMin' | 'repsMax' | 'loadValue' | 'restSeconds'>): SetForm {
  const reps = set.reps != null ? String(set.reps) : set.repsMin != null && set.repsMax != null ? `${set.repsMin}-${set.repsMax}` : '';
  return {
    reps,
    load: set.loadValue != null ? String(set.loadValue).replace('.', ',') : '',
    rest: set.restSeconds != null ? String(set.restSeconds) : '',
  };
}

const INT = /^\d+$/;

/**
 * "12" → exata; "8-12" / "8–12" / "8 a 12" → faixa; vazio → sem prescrição de reps.
 * Nunca converte uma forma na outra (mesma regra do backend: reps OU repsMin+repsMax).
 */
export function parseReps(text: string): Pick<WorkoutSetInput, 'reps' | 'repsMin' | 'repsMax'> | { error: string } {
  const value = text.trim();
  if (value === '') return { reps: null, repsMin: null, repsMax: null };
  if (INT.test(value)) return { reps: Number(value), repsMin: null, repsMax: null };
  const range = /^(\d+)\s*(?:-|–|a)\s*(\d+)$/i.exec(value);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > max) return { error: 'Na faixa, o mínimo não pode ser maior que o máximo.' };
    return { reps: null, repsMin: min, repsMax: max };
  }
  return { error: 'Repetições: use um número (12) ou uma faixa (8-12).' };
}

/** Número opcional ≥ 0 ("" → null); aceita vírgula decimal quando `decimal`. */
function parseOptional(text: string, label: string, decimal: boolean): number | null | { error: string } {
  const value = text.trim().replace(',', '.');
  if (value === '') return null;
  const ok = decimal ? /^\d+(\.\d+)?$/.test(value) : INT.test(value);
  return ok ? Number(value) : { error: `${label}: informe um número${decimal ? '' : ' inteiro'} maior ou igual a zero.` };
}

const isError = (value: unknown): value is { error: string } => typeof value === 'object' && value !== null && 'error' in value;

/** Formulário → corpo da API (PATCH/POST de série), ou a mensagem do primeiro campo inválido. */
export function formToSetInput(form: SetForm, currentLoadUnit: string | null): WorkoutSetInput | { error: string } {
  const reps = parseReps(form.reps);
  if (isError(reps)) return reps;
  const load = parseOptional(form.load, 'Carga', true);
  if (isError(load)) return load;
  const rest = parseOptional(form.rest, 'Descanso', false);
  if (isError(rest)) return rest;
  return {
    ...reps,
    loadValue: load,
    // Carga informada sem unidade vira kg; a unidade existente é preservada.
    loadUnit: load == null ? currentLoadUnit : (currentLoadUnit ?? 'kg'),
    restSeconds: rest,
  };
}

export function isSetInputError(value: WorkoutSetInput | { error: string }): value is { error: string } {
  return isError(value);
}
