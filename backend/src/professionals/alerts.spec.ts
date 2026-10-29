import { daysSince, latest, nextBirthday, pickOption, todayIn } from './alerts';

describe('avisos do painel — regras', () => {
  it('hoje no fuso do Brasil (23h de Brasília ainda é o mesmo dia)', () => {
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-30T01:30:00Z'))).toEqual({ year: 2026, month: 10, day: 29 });
  });

  it('próximo aniversário, idade que vai fazer e virada de ano', () => {
    const today = { year: 2026, month: 10, day: 29 };
    expect(nextBirthday(new Date('1990-10-29T00:00:00Z'), today)).toEqual({ inDays: 0, date: '2026-10-29', age: 36 });
    expect(nextBirthday(new Date('1985-11-02T00:00:00Z'), today)).toEqual({ inDays: 4, date: '2026-11-02', age: 41 });
    expect(nextBirthday(new Date('2000-10-28T00:00:00Z'), today).date).toBe('2027-10-28');
    expect(nextBirthday(new Date('1995-01-02T00:00:00Z'), { year: 2026, month: 12, day: 30 })).toEqual({ inDays: 3, date: '2027-01-02', age: 32 });
  });

  it('29/02 vira 28/02 em ano não bissexto', () => {
    expect(nextBirthday(new Date('2000-02-29T00:00:00Z'), { year: 2027, month: 2, day: 25 })).toMatchObject({ inDays: 3, date: '2027-02-28' });
    expect(nextBirthday(new Date('2000-02-29T00:00:00Z'), { year: 2028, month: 2, day: 25 })).toMatchObject({ inDays: 4, date: '2028-02-29' });
  });

  it('dias desde, data mais recente e opção mais próxima', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(daysSince(new Date('2026-10-22T12:00:00Z'), now)).toBe(7);
    expect(daysSince(new Date('2026-10-22T12:00:01Z'), now)).toBe(6);
    expect(latest(null, new Date('2026-01-01'), undefined, new Date('2026-03-01'))).toEqual(new Date('2026-03-01'));
    expect(latest(null, undefined)).toBeNull();
    expect(pickOption(10, [3, 7, 14, 30], 7)).toBe(7);
    expect(pickOption(undefined, [3, 7, 14, 30], 7)).toBe(7);
    expect(pickOption(Number.NaN, [3, 7, 14, 30], 7)).toBe(7);
  });
});
