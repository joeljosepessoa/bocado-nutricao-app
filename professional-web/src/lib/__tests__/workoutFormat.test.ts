import { describe, expect, it } from 'vitest';
import { describeSet, formatReps, formatSeconds, summarizeSets, type SetPrescription } from '../workoutFormat';

const set = (overrides: Partial<SetPrescription> = {}): SetPrescription => ({
  reps: null,
  repsMin: null,
  repsMax: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  ...overrides,
});

describe('formatReps', () => {
  it('exata mostra o número; faixa mostra mínimo–máximo; nada informado é null', () => {
    expect(formatReps(set({ reps: 12 }))).toBe('12');
    expect(formatReps(set({ repsMin: 6, repsMax: 10 }))).toBe('6–10');
    expect(formatReps(set())).toBeNull();
  });

  it('série antiga sem os campos de faixa continua funcionando', () => {
    expect(formatReps({ reps: 8 })).toBe('8');
  });
});

describe('formatSeconds', () => {
  it('formata segundos e minutos', () => {
    expect(formatSeconds(45)).toBe('45s');
    expect(formatSeconds(90)).toBe('1min30');
    expect(formatSeconds(120)).toBe('2min');
  });
});

describe('describeSet / summarizeSets', () => {
  it('descreve carga, duração, distância, cadência e descanso', () => {
    expect(describeSet(set({ reps: 12, loadValue: 25, loadUnit: 'kg', restSeconds: 60, tempo: '3-1-2' }))).toBe(
      '12 reps · 25 kg · cadência 3-1-2 · descanso 1min',
    );
    expect(describeSet(set({ durationSeconds: 30 }))).toBe('30s');
    expect(describeSet(set({ distanceMeters: 5000 }))).toBe('5 km');
    expect(describeSet(set())).toBe('sem prescrição informada');
  });

  it('séries iguais viram uma linha "N × ..."', () => {
    const range = set({ repsMin: 6, repsMax: 10, restSeconds: 90 });
    expect(summarizeSets([range, range, range, range])).toEqual(['4 × 6–10 reps · descanso 1min30']);
  });

  it('séries diferentes aparecem uma a uma, na ordem, sem média', () => {
    expect(summarizeSets([set({ reps: 12 }), set({ reps: 10 }), set({ reps: 8 })])).toEqual([
      'Série 1: 12 reps',
      'Série 2: 10 reps',
      'Série 3: 8 reps',
    ]);
  });

  it('sem séries', () => {
    expect(summarizeSets([])).toEqual(['Nenhuma série prescrita']);
  });
});
