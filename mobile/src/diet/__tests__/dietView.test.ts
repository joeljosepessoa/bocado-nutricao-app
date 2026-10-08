import type { DietClientDay, DietClientSummary, NutritionRange } from '../../types/api';
import { amountText, dayTitle, dietDays, formatNumber, mealSummary, showDayTabs, supplementQuantityText } from '../dietView';

const range = (kcal: number): NutritionRange => ({
  min: { kcal, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  max: { kcal, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  partial: false,
});

const day = (label: string | null, kind: DietClientDay['kind'], order: number, mealNames: string[]): DietClientDay => ({
  label,
  kind,
  usageNotes: null,
  order,
  nutrition: range(0),
  meals: mealNames.map((name, i) => ({ name, order: mealNames.length - i, time: null, notes: null, nutrition: range(0), groups: [] })),
});

describe('dias da dieta (API nova)', () => {
  const diet: DietClientSummary = {
    dietId: 'd1',
    versionId: 'v1',
    meals: [],
    days: [day('DIA DE DESCANSO', 'rest', 1, ['CEIA']), day('DIA DE TREINO', 'training', 0, ['ALMOÇO', 'CAFÉ DA MANHÃ'])],
  };

  it('ordena dias e refeições pela ordem da API e mostra o seletor de dia', () => {
    const days = dietDays(diet);
    expect(days.map((d, i) => dayTitle(d, i))).toEqual(['DIA DE TREINO', 'DIA DE DESCANSO']);
    expect(days[0].meals.map((m) => m.name)).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO']);
    expect(showDayTabs(days)).toBe(true);
  });

  it('título do dia sem nome vem do tipo; início conta refeições por dia', () => {
    expect(dayTitle({ label: null, kind: 'training' }, 0)).toBe('Dia de treino');
    expect(dayTitle({ label: null, kind: 'rest' }, 1)).toBe('Dia de descanso');
    expect(dayTitle({ label: null, kind: 'other' }, 2)).toBe('Dia 3');
    expect(mealSummary(diet)).toBe('DIA DE TREINO: 2 refeições · DIA DE DESCANSO: 1 refeição');
  });
});

describe('compatibilidade com dietas antigas', () => {
  const legacy: DietClientSummary = {
    dietId: 'd1',
    versionId: 'v1',
    meals: [
      { name: 'Jantar', order: 1, time: null, notes: null, foods: [{ foodName: 'Frango', quantity: 150, unit: 'g', kcal: 248, proteinG: 46, carbG: 0, fatG: 5, substitutions: [] }] },
      { name: 'Almoço', order: 0, time: '12:00', notes: 'Mastigar devagar', foods: [{ foodName: 'Arroz', quantity: 100, unit: 'g', kcal: 130, proteinG: 2.7, carbG: 28, fatG: 0.3, substitutions: [] }] },
    ],
  };

  it('dieta convertida pelo P1 (dia único sem nome) não mostra seletor de dia', () => {
    const converted: DietClientSummary = { ...legacy, days: [day(null, 'other', 0, ['Almoço'])] };
    expect(showDayTabs(dietDays(converted))).toBe(false);
    expect(mealSummary(converted)).toBe('1 refeição prescrita.');
  });

  it('API anterior à estrutura nova (só "meals"): um dia único com itens fixos, na ordem, como antes', () => {
    const days = dietDays(legacy);
    expect(days).toHaveLength(1);
    expect(showDayTabs(days)).toBe(false);
    expect(days[0].meals.map((m) => [m.name, m.time, m.notes])).toEqual([
      ['Almoço', '12:00', 'Mastigar devagar'],
      ['Jantar', null, null],
    ]);
    expect(days[0].meals[0].groups).toEqual([
      expect.objectContaining({ kind: 'fixed', choices: [expect.objectContaining({ foods: [expect.objectContaining({ foodName: 'Arroz', isFreeQuantity: false, notes: null })] })] }),
    ]);
    expect(days[0].meals[0].nutrition).toBeNull();
    expect(mealSummary(legacy)).toBe('2 refeições prescritas.');
  });
});

describe('formatação', () => {
  it('números em pt-BR: milhar com ponto, decimal com vírgula; faixas de quantidade', () => {
    expect(formatNumber(1800.4, 0)).toBe('1.800');
    expect(formatNumber(2.5, 1)).toBe('2,5');
    expect(amountText(3, 5)).toBe('3–5');
    expect(amountText(0.5, null)).toBe('0,5');
  });

  it('suplementos: "3–5 g", "1 cápsula" e só o texto quando não há número', () => {
    expect(supplementQuantityText({ quantity: 3, quantityMax: 5, unitText: 'g' })).toBe('3–5 g');
    expect(supplementQuantityText({ quantity: 1, quantityMax: null, unitText: 'cápsula' })).toBe('1 cápsula');
    expect(supplementQuantityText({ quantity: null, quantityMax: null, unitText: null })).toBe('');
  });
});
