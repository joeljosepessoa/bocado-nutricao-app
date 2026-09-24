import { BadRequestException } from '@nestjs/common';

export interface RepsPrescription {
  reps?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
}

const isSet = (value: number | null | undefined): value is number => value !== null && value !== undefined;

/**
 * Prescrição exata usa só `reps`; faixa usa só `repsMin`+`repsMax`. Nunca
 * converte uma forma na outra — só rejeita combinações que não têm leitura
 * única (é o profissional quem decide, não o sistema).
 */
export function assertValidRepsPrescription({ reps, repsMin, repsMax }: RepsPrescription): void {
  const hasRange = isSet(repsMin) || isSet(repsMax);
  if (isSet(reps) && hasRange) {
    throw new BadRequestException('Informe repetições exatas ou uma faixa (mínimo e máximo), nunca os dois.');
  }
  if (isSet(repsMin) !== isSet(repsMax)) {
    throw new BadRequestException('A faixa de repetições precisa de mínimo e máximo.');
  }
  if (isSet(repsMin) && isSet(repsMax) && repsMin > repsMax) {
    throw new BadRequestException('O mínimo da faixa de repetições não pode ser maior que o máximo.');
  }
}

/** Estado final de uma atualização parcial: `undefined` no DTO mantém o valor gravado. */
export function mergeRepsPrescription(
  existing: { reps: number | null; repsMin: number | null; repsMax: number | null },
  patch: RepsPrescription,
): RepsPrescription {
  return {
    reps: patch.reps !== undefined ? patch.reps : existing.reps,
    repsMin: patch.repsMin !== undefined ? patch.repsMin : existing.repsMin,
    repsMax: patch.repsMax !== undefined ? patch.repsMax : existing.repsMax,
  };
}
