import { BadRequestException } from '@nestjs/common';
import { assertValidRepsPrescription, mergeRepsPrescription } from './workout-set-reps';

describe('assertValidRepsPrescription', () => {
  it('aceita prescrição exata', () => {
    expect(() => assertValidRepsPrescription({ reps: 12, repsMin: null, repsMax: null })).not.toThrow();
  });

  it('aceita faixa completa', () => {
    expect(() => assertValidRepsPrescription({ reps: null, repsMin: 6, repsMax: 10 })).not.toThrow();
  });

  it('aceita faixa degenerada (mínimo igual ao máximo) sem convertê-la em exata', () => {
    expect(() => assertValidRepsPrescription({ reps: undefined, repsMin: 8, repsMax: 8 })).not.toThrow();
  });

  it('aceita série sem repetições (ex.: cardio por tempo)', () => {
    expect(() => assertValidRepsPrescription({ reps: undefined, repsMin: undefined, repsMax: undefined })).not.toThrow();
  });

  it('rejeita exata e faixa ao mesmo tempo', () => {
    expect(() => assertValidRepsPrescription({ reps: 8, repsMin: 6, repsMax: 10 })).toThrow(BadRequestException);
  });

  it('rejeita faixa sem máximo ou sem mínimo', () => {
    expect(() => assertValidRepsPrescription({ reps: null, repsMin: 6, repsMax: null })).toThrow(BadRequestException);
    expect(() => assertValidRepsPrescription({ reps: null, repsMin: undefined, repsMax: 10 })).toThrow(BadRequestException);
  });

  it('rejeita mínimo maior que o máximo', () => {
    expect(() => assertValidRepsPrescription({ reps: null, repsMin: 12, repsMax: 8 })).toThrow(BadRequestException);
  });
});

describe('mergeRepsPrescription', () => {
  const existing = { reps: 12, repsMin: null, repsMax: null };

  it('undefined mantém o valor gravado', () => {
    expect(mergeRepsPrescription(existing, { reps: undefined, repsMin: undefined, repsMax: undefined })).toEqual(existing);
  });

  it('trocar exata por faixa sem limpar reps resulta num estado inválido (detectado pela validação)', () => {
    const merged = mergeRepsPrescription(existing, { reps: undefined, repsMin: 6, repsMax: 10 });
    expect(() => assertValidRepsPrescription(merged)).toThrow(BadRequestException);
  });

  it('trocar exata por faixa limpando reps explicitamente é válido', () => {
    const merged = mergeRepsPrescription(existing, { reps: null, repsMin: 6, repsMax: 10 });
    expect(merged).toEqual({ reps: null, repsMin: 6, repsMax: 10 });
    expect(() => assertValidRepsPrescription(merged)).not.toThrow();
  });
});
