import { describe, expect, it } from 'vitest';
import { choice, day, fixed, group, item, meal, range } from './fixtures';
import { choiceImbalances, choiceKcalDiff, dayFirstChoiceTotals, formatKcalDiff, mealFirstChoiceTotals } from '../structure';
import { ageAt, basalMetabolicRate, computeTarget, differenceFromTarget, sexFromText } from '../nutritionTarget';

const options = (kcals: number[], partialAt = -1) =>
  group(
    'g-opt',
    'meal_options',
    null,
    kcals.map((k, i) => choice(`c${i}`, `Opção ${i + 1}`, [item('x', 100, 'g', k)], range(k, k, i === partialAt))),
    range(Math.min(...kcals), Math.max(...kcals)),
  );

describe('diferença de kcal entre opções', () => {
  it('compara cada escolha com a 1ª do bloco', () => {
    const g = options([800, 832, 656]);
    expect(choiceKcalDiff(g, 0)).toBeNull();
    expect(choiceKcalDiff(g, 1)).toBeCloseTo(0.04);
    expect(choiceKcalDiff(g, 2)).toBeCloseTo(-0.18);
    expect(formatKcalDiff(0.04)).toBe('+4%');
    expect(formatKcalDiff(-0.18)).toBe('−18%');
    expect(formatKcalDiff(0.004)).toBe('igual');
  });

  it('não compara itens fixos, total parcial nem 1ª escolha sem kcal', () => {
    expect(choiceKcalDiff(fixed('f', [], range(300)), 0)).toBeNull();
    expect(choiceKcalDiff(options([800, 650], 1), 1)).toBeNull();
    expect(choiceKcalDiff(options([0, 650]), 1)).toBeNull();
  });

  it('lista só o que passa de 10%, com dia, refeição e as kcal', () => {
    const jantar = meal('m1', 'Jantar', [options([900, 960, 738])], range(738, 960));
    const lanche = meal(
      'm2',
      'Lanche',
      [group('g-alt', 'alternatives', 'Acréscimo', [choice('a', null, [], range(178)), choice('b', null, [], range(130))], range(130, 178))],
      range(130, 178),
    );
    const days = [day('d1', null, 'training', [jantar], range(738, 960)), day('d2', 'FIM DE SEMANA', 'other', [lanche], range(130, 178))];
    expect(choiceImbalances(days)).toEqual([
      { day: 'Dia de treino', meal: 'Jantar', choice: 'Opção 3', diff: expect.closeTo(-0.18, 5), kcal: 738, baseKcal: 900, baseChoice: 'Opção 1' },
      { day: 'FIM DE SEMANA', meal: 'Lanche · Acréscimo', choice: 'Alternativa 2', diff: expect.closeTo(-0.27, 2), kcal: 130, baseKcal: 178, baseChoice: 'Alternativa 1' },
    ]);
    // Com um único dia, o nome do dia não aparece.
    expect(choiceImbalances([days[0]])[0].day).toBeNull();
  });
});

describe('totais com a 1ª escolha de cada bloco', () => {
  it('soma itens fixos + 1ª escolha de cada bloco; faixa de quantidade conta pelo meio', () => {
    const almoco = meal(
      'm',
      'Almoço',
      [
        group('p', 'alternatives', 'Proteína', [choice('p1', null, [], range(300)), choice('p2', null, [], range(500))], range(300, 500)),
        group('c', 'alternatives', 'Carboidrato', [choice('c1', null, [], range(200, 260)), choice('c2', null, [], range(100))], range(100, 260)),
        fixed('f', [], range(100)),
      ],
      range(600, 860),
    );
    const total = mealFirstChoiceTotals(almoco);
    expect(total.kcal).toBe(300 + 230 + 100);
    expect(total.proteinG).toBeCloseTo(300 / 20 + 230 / 20 + 100 / 20);
    expect(total.partial).toBe(false);

    const dia = day('d', null, 'other', [almoco, meal('m2', 'Ceia', [fixed('f2', [], range(150, 150, true))], range(150, 150, true))], range(750, 1010));
    expect(dayFirstChoiceTotals(dia)).toMatchObject({ kcal: 780, partial: true });
  });
});

describe('meta nutricional', () => {
  it('Harris-Benedict e Mifflin-St. Jeor (as mesmas do relatório da avaliação)', () => {
    expect(Math.round(basalMetabolicRate('harris_benedict', 'male', 95.1, 195, 39))).toBe(2085);
    expect(Math.round(basalMetabolicRate('mifflin_st_jeor', 'female', 61.2, 156.5, 38))).toBe(1239);
  });

  it('gasto do dia, objetivo e macros: carboidrato fica com o restante', () => {
    const result = computeTarget({
      formula: 'mifflin_st_jeor',
      sex: 'female',
      weightKg: 64.1,
      heightCm: 156.5,
      age: 38,
      activityFactor: 1.55,
      objectivePercent: -20,
      proteinGPerKg: 2,
      fatGPerKg: 0.8,
    });
    // TMB 10×64,1 + 6,25×156,5 − 5×38 − 161 = 1268,1 → GET ×1,55 = 1965,6 → −20% = 1572
    expect(result).toEqual({ bmr: 1268, tdee: 1966, kcal: 1572, proteinG: 128, fatG: 51, carbG: Math.round((1572 - 128 * 4 - 51 * 9) / 4), carbWouldBeNegative: false });
  });

  it('avisa quando proteína e gordura já passam da meta', () => {
    const result = computeTarget({ formula: 'harris_benedict', sex: 'female', weightKg: 50, heightCm: 150, age: 60, activityFactor: 1.2, objectivePercent: -25, proteinGPerKg: 3, fatGPerKg: 1.5 });
    expect(result.carbWouldBeNegative).toBe(true);
    expect(result.carbG).toBe(0);
  });

  it('idade, sexo e diferença para a meta', () => {
    expect(ageAt('1987-11-25', new Date(2026, 9, 22))).toBe(38);
    expect(ageAt('1987-10-22', new Date(2026, 9, 22))).toBe(39);
    expect(ageAt(null)).toBeNull();
    expect(sexFromText('Feminino')).toBe('female');
    expect(sexFromText('male')).toBe('male');
    expect(sexFromText('outro')).toBeNull();
    expect(differenceFromTarget(2150, 2300)).toBeCloseTo(-0.0652, 3);
    expect(differenceFromTarget(2150, null)).toBeNull();
  });
});
