import { filterByPeriod } from '../periodFilter';
import type { EvolutionEntry } from '../../types/api';

function entryAt(iso: string): EvolutionEntry {
  return {
    id: iso,
    evaluatedAt: iso,
    weightKg: 80,
    bmi: 25,
    bmiClassification: 'sobrepeso',
    bodyFatPercent: 15,
    fatMassKg: 12,
    leanMassKg: 68,
    measurements: null,
    composition: null,
  };
}

describe('filterByPeriod', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  const entries = [
    entryAt('2025-01-01T00:00:00Z'), // > 12m atrás
    entryAt('2025-10-01T00:00:00Z'), // ~11.5m atrás — dentro de 12m
    entryAt('2026-04-01T00:00:00Z'), // ~5.5m atrás — dentro de 6m
    entryAt('2026-08-01T00:00:00Z'), // ~1.5m atrás — dentro de 3m
  ];

  it('"all" devolve tudo, sem filtrar', () => {
    expect(filterByPeriod(entries, 'all', now)).toHaveLength(4);
  });

  it('"12m" exclui só o que passou de 12 meses', () => {
    const result = filterByPeriod(entries, '12m', now);
    expect(result).toHaveLength(3);
    expect(result.some((e) => e.id === '2025-01-01T00:00:00Z')).toBe(false);
  });

  it('"6m" mantém só os últimos 6 meses', () => {
    const result = filterByPeriod(entries, '6m', now);
    expect(result.map((e) => e.id)).toEqual(['2026-04-01T00:00:00Z', '2026-08-01T00:00:00Z']);
  });

  it('"3m" mantém só o mais recente', () => {
    const result = filterByPeriod(entries, '3m', now);
    expect(result.map((e) => e.id)).toEqual(['2026-08-01T00:00:00Z']);
  });

  it('lista vazia continua vazia em qualquer período', () => {
    expect(filterByPeriod([], '3m', now)).toEqual([]);
  });
});
