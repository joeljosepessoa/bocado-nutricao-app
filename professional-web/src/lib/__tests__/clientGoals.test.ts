import { describe, expect, it } from 'vitest';
import { parseGoals } from '../clientGoals';

describe('parseGoals', () => {
  it('campos vazios viram null (sem meta)', () => {
    expect(parseGoals('', '  ')).toEqual({ targetWeightKg: null, waterGoalMl: null });
  });

  it('aceita vírgula decimal no peso e arredonda a uma casa', () => {
    expect(parseGoals('68,55', '2800')).toEqual({ targetWeightKg: 68.6, waterGoalMl: 2800 });
  });

  it('recusa valores fora da faixa ou inválidos', () => {
    expect(parseGoals('10', '')).toHaveProperty('error');
    expect(parseGoals('abc', '')).toHaveProperty('error');
    expect(parseGoals('', '2500,5')).toHaveProperty('error');
    expect(parseGoals('', '200')).toHaveProperty('error');
  });
});
