import type { NormalizedScaleReading } from './types';

/** Só para a demonstração do pipeline com MockBleTransport — nunca usado por um driver real. */
export function simulateReading(): NormalizedScaleReading {
  const weightKg = round(68 + Math.random() * 25, 1);
  const bodyFatPercent = round(14 + Math.random() * 14, 1);
  return {
    weightKg,
    bodyFatPercent,
    muscleMassKg: round(weightKg * (1 - bodyFatPercent / 100) * 0.55, 1),
    bodyWaterPercent: round(45 + Math.random() * 10, 1),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
