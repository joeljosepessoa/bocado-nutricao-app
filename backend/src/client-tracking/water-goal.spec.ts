import { formatCalendarDate, parseCalendarDate, resolveWaterGoal } from './water-goal';

describe('resolveWaterGoal', () => {
  it('usa a meta do nutricionista quando existe', () => {
    expect(resolveWaterGoal(2800, 70)).toEqual({ goalMl: 2800, source: 'professional' });
  });

  it('sem meta, calcula 35 ml por kg do peso atual', () => {
    expect(resolveWaterGoal(null, 72.4)).toEqual({ goalMl: 2534, source: 'weight' });
  });

  it('sem meta e sem peso, usa 2000 ml', () => {
    expect(resolveWaterGoal(null, null)).toEqual({ goalMl: 2000, source: 'default' });
    expect(resolveWaterGoal(undefined, undefined)).toEqual({ goalMl: 2000, source: 'default' });
  });
});

describe('parseCalendarDate', () => {
  it('aceita AAAA-MM-DD válido e devolve meia-noite UTC', () => {
    expect(parseCalendarDate('2026-10-08')?.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(formatCalendarDate(parseCalendarDate('2026-02-28')!)).toBe('2026-02-28');
  });

  it('recusa formatos e datas inexistentes', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('08/10/2026')).toBeNull();
    expect(parseCalendarDate('2026-10-08T10:00')).toBeNull();
  });
});
