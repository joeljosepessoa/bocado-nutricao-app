import { toChartPoints } from '../chartData';
import { findMetric } from '../metricCatalog';
import type { EvolutionEntry } from '../../types/api';

function makeEntry(overrides: Partial<EvolutionEntry>): EvolutionEntry {
  return {
    id: 'e',
    evaluatedAt: '2026-01-01T00:00:00Z',
    weightKg: null,
    bmi: null,
    bmiClassification: null,
    bodyFatPercent: null,
    fatMassKg: null,
    leanMassKg: null,
    measurements: null,
    composition: null,
    ...overrides,
  };
}

describe('toChartPoints', () => {
  it('mapeia cada avaliação com a métrica presente para um ponto, ordenado por tempo real', () => {
    const entries = [
      makeEntry({ id: 'b', evaluatedAt: '2026-03-01T00:00:00Z', weightKg: 78 }),
      makeEntry({ id: 'a', evaluatedAt: '2026-01-01T00:00:00Z', weightKg: 82 }),
    ];
    const points = toChartPoints(entries, findMetric('weightKg'));

    expect(points).toHaveLength(2);
    expect(points[0].evaluationId).toBe('a');
    expect(points[1].evaluationId).toBe('b');
    expect(points[0].value).toBe(82);
    expect(points[1].value).toBe(78);
    expect(points[0].timestamp).toBeLessThan(points[1].timestamp);
  });

  it('omite avaliações sem a métrica — nunca interpola nem zera', () => {
    const entries = [
      makeEntry({ id: 'a', evaluatedAt: '2026-01-01T00:00:00Z', weightKg: 82 }),
      makeEntry({ id: 'b', evaluatedAt: '2026-02-01T00:00:00Z', weightKg: null }),
      makeEntry({ id: 'c', evaluatedAt: '2026-03-01T00:00:00Z', weightKg: 78 }),
    ];
    const points = toChartPoints(entries, findMetric('weightKg'));

    expect(points.map((p) => p.evaluationId)).toEqual(['a', 'c']);
  });

  it('lê métricas aninhadas de medidas e composição', () => {
    const entries = [
      makeEntry({
        id: 'a',
        measurements: {
          chestCm: null,
          waistCm: 85,
          abdomenCm: null,
          hipCm: null,
          armRightCm: null,
          armLeftCm: null,
          forearmRightCm: null,
          forearmLeftCm: null,
          thighRightCm: null,
          thighLeftCm: null,
          calfRightCm: null,
          calfLeftCm: null,
          wristCm: null,
          femurBicondylarCm: null,
        },
        composition: {
          muscleMassKg: 32,
          skeletalMuscleMassKg: null,
          bodyWaterPercent: null,
          visceralFatLevel: null,
          boneMassKg: null,
          basalMetabolicRateKcal: null,
          bodyAgeYears: null,
        },
      }),
    ];

    expect(toChartPoints(entries, findMetric('waistCm'))[0].value).toBe(85);
    expect(toChartPoints(entries, findMetric('muscleMassKg'))[0].value).toBe(32);
  });

  it('lista vazia gera nenhum ponto', () => {
    expect(toChartPoints([], findMetric('weightKg'))).toEqual([]);
  });
});
