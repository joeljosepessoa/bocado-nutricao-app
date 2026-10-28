import { describe, expect, it } from 'vitest';
import type { FoodDetails } from '../../types/api';
import { EMPTY_FOOD_FORM, foodFormResult, formFromDetails, marksUsed, measureOptions, nutrientText, parseDecimal } from '../foodFormat';

const details = (over: Partial<FoodDetails> = {}): FoodDetails => ({
  id: 'f1',
  name: 'Banana, prata, crua',
  origin: 'taco',
  tacoNumber: 182,
  sourceEdition: 'TACO 4ª edição',
  foodGroup: 'Frutas e derivados',
  preparation: 'crua',
  baseUnit: 'g',
  kcalPer100: 98.25,
  proteinGPer100: 1.27,
  carbGPer100: 26,
  fatGPer100: 0.07,
  fiberGPer100: null,
  sodiumMgPer100: null,
  pending: false,
  unitConversions: [{ unit: 'unit', gramsEquivalent: 55 }],
  sections: [],
  usage: { patients: 0, dietItems: 0, templates: 0 },
  canEdit: false,
  canDelete: false,
  ...over,
});

describe('ficha do alimento', () => {
  it('mostra o valor na porção e o marcador da TACO (nunca 0)', () => {
    expect(nutrientText({ key: 'energia_kcal', label: 'Energia', unit: 'kcal', value: 98.25, status: 'valor' })).toBe('98 kcal');
    expect(nutrientText({ key: 'proteina', label: 'Proteína', unit: 'g', value: 1.27, status: 'valor' }, 1.5)).toBe('1,9 g');
    expect(nutrientText({ key: 'umidade', label: 'Umidade', unit: '%', value: 70.1, status: 'valor' }, 1.5)).toBe('70,1 %');
    expect(nutrientText({ key: 'cobre', label: 'Cobre', unit: 'mg', value: 0.06, status: 'valor' })).toBe('0,06 mg');
    expect(nutrientText({ key: 'niacina', label: 'Niacina', unit: 'mg', value: null, status: 'traco' })).toBe('Tr');
    expect(nutrientText({ key: 'retinol', label: 'Retinol', unit: 'mcg', value: null, status: 'nao_aplicavel' })).toBe('NA');
  });

  it('legenda só com os marcadores que aparecem', () => {
    const marks = marksUsed([{ title: 'Vitaminas', rows: [{ key: 'niacina', label: 'Niacina', unit: 'mg', value: null, status: 'traco' }] }]);
    expect(marks.map((m) => m.mark)).toEqual(['Tr']);
  });

  it('calculadora oferece a base e as medidas caseiras', () => {
    expect(measureOptions(details())).toEqual([
      { unit: 'g', grams: 1, label: 'g' },
      { unit: 'unit', grams: 55, label: 'unidade(s)' },
    ]);
  });
});

describe('formulário do alimento', () => {
  it('aceita vírgula e exige os 4 valores principais', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    const { errors } = foodFormResult({ ...EMPTY_FOOD_FORM, name: 'Pão de queijo', kcal: '363', protein: '5,1' });
    expect(errors).toEqual(['Carboidrato: informe um número (pode ser 0).', 'Gordura: informe um número (pode ser 0).']);
  });

  it('monta o alimento com medidas caseiras e recusa medida repetida', () => {
    const base = { ...EMPTY_FOOD_FORM, name: ' Pão de queijo ', kcal: '363', protein: '5,1', carb: '34,2', fat: '24', foodGroup: 'Alimentos preparados' };
    const ok = foodFormResult({ ...base, measures: [{ unit: 'unit', grams: '20' }, { unit: '', grams: '' }] });
    expect(ok.input).toEqual({
      name: 'Pão de queijo',
      baseUnit: 'g',
      kcalPer100: 363,
      proteinGPer100: 5.1,
      carbGPer100: 34.2,
      fatGPer100: 24,
      foodGroup: 'Alimentos preparados',
      unitConversions: [{ unit: 'unit', gramsEquivalent: 20 }],
    });
    const repeated = foodFormResult({ ...base, measures: [{ unit: 'unit', grams: '20' }, { unit: 'unit', grams: '30' }] });
    expect(repeated.errors).toEqual(['Medida "unidade(s)" repetida.']);
  });

  it('duplicar da TACO deixa vazio o que a TACO não tem número', () => {
    const form = formFromDetails(details({ fatGPer100: null }), true);
    expect(form).toMatchObject({ name: 'Banana, prata, crua (meu)', kcal: '98,25', fat: '', measures: [{ unit: 'unit', grams: '55' }] });
  });
});
