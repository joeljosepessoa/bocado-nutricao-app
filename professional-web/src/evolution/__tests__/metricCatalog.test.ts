import { describe, expect, it } from 'vitest';
import { findMetric, toChartPoints } from '../metricCatalog';
import type { EvolutionPoint } from '../../types/api';

function makePoint(overrides: Partial<EvolutionPoint>): EvolutionPoint {
  return {
    id: 'e',
    evaluatedAt: '2026-01-01T00:00:00Z',
    releasedToClientAt: null,
    weightKg: null,
    bmi: null,
    bmiClassification: null,
    bodyFatPercent: null,
    bodyFatPercentSource: null,
    fatMassKg: null,
    leanMassKg: null,
    measurements: null,
    skinfoldSumMm: null,
    protocolCode: null,
    protocolVersion: null,
    bioimpedance: null,
    ...overrides,
  };
}

describe('toChartPoints', () => {
  it('ordena por tempo real e omite pontos sem a métrica', () => {
    const points = [
      makePoint({ id: 'b', evaluatedAt: '2026-03-01T00:00:00Z', weightKg: 78 }),
      makePoint({ id: 'a', evaluatedAt: '2026-01-01T00:00:00Z', weightKg: 82 }),
      makePoint({ id: 'c', evaluatedAt: '2026-02-01T00:00:00Z', weightKg: null }),
    ];
    const chartPoints = toChartPoints(points, findMetric('weightKg'));
    expect(chartPoints.map((p) => p.evaluationId)).toEqual(['a', 'b']);
    expect(chartPoints[0].value).toBe(82);
  });

  it('lê métricas de circunferências e composição', () => {
    const points = [
      makePoint({
        measurements: {
          chestCm: null, waistCm: 85, abdomenCm: null, hipCm: null,
          armRightCm: null, armLeftCm: null, forearmRightCm: null, forearmLeftCm: null,
          thighRightCm: null, thighLeftCm: null, calfRightCm: null, calfLeftCm: null,
          wristCm: null, femurBicondylarCm: null,
        },
        bioimpedance: {
          origin: 'manual', recordedAt: '2026-01-01', weightKg: null, bodyFatPercent: null,
          fatMassKg: null, leanMassKg: null, skeletalMuscleMassKg: null, muscleMassKg: 32,
          bodyWaterPercent: null, visceralFatLevel: null, basalMetabolicRateKcal: null,
          bodyAgeYears: null, boneMassKg: null,
        },
      }),
    ];
    expect(toChartPoints(points, findMetric('waistCm'))[0].value).toBe(85);
    expect(toChartPoints(points, findMetric('muscleMassKg'))[0].value).toBe(32);
  });
});
