import { describe, expect, it } from 'vitest';
import { shortCalendarDay, waterSummary, weightSummary } from '../tracking';

const w = (kg: number, iso: string, source: 'self' | 'evaluation' = 'self') => ({ id: source === 'self' ? iso : null, weightKg: kg, recordedAt: iso, source });

describe('weightSummary', () => {
  it('último, primeiro, variação e distância da meta a partir dos registros reais', () => {
    const s = weightSummary([w(78.4, '2026-10-08T10:00:00Z'), w(80, '2026-09-01T10:00:00Z', 'evaluation'), w(79.2, '2026-09-20T10:00:00Z')], 72);
    expect(s.latest?.weightKg).toBe(78.4);
    expect(s.first?.weightKg).toBe(80);
    expect(s.change).toBe(-1.6);
    expect(s.toTarget).toBe(6.4);
  });

  it('sem meta ou com um único registro, não inventa números', () => {
    const s = weightSummary([w(70, '2026-10-08T10:00:00Z')], null);
    expect(s.change).toBeNull();
    expect(s.toTarget).toBeNull();
    expect(weightSummary([], 70)).toEqual({ latest: null, first: null, change: null, toTarget: null });
  });
});

describe('waterSummary', () => {
  it('conta dias com registro, dias na meta e média', () => {
    const s = waterSummary({ goalMl: 2000, goalSource: 'weight', days: [{ date: '2026-10-08', totalMl: 2100 }, { date: '2026-10-07', totalMl: 900 }] });
    expect(s).toEqual({ daysWithRecords: 2, daysOnGoal: 1, averageMl: 1500 });
  });

  it('sem registros: média nula', () => {
    expect(waterSummary({ goalMl: 2000, goalSource: 'default', days: [] })).toEqual({ daysWithRecords: 0, daysOnGoal: 0, averageMl: null });
    expect(shortCalendarDay('2026-10-08')).toBe('08/10');
  });
});
