import { describe, expect, it } from 'vitest';
import type { DietDayNode, DietGroupNode, MealFood, NutritionRange } from '../../types/api';
import {
  dayTitle,
  foodCalcStatus,
  foodItemErrors,
  formatKcal,
  isSimpleDiet,
  quantityText,
  reorderPatches,
  showDayTabs,
  structureProblems,
  supplementErrors,
  supplementQuantityText,
} from '../structure';

const range = (min: number, max = min, partial = false): NutritionRange => ({
  min: { kcal: min, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  max: { kcal: max, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  partial,
});

const food = (extra: Partial<MealFood> = {}): MealFood => ({
  id: 'f1',
  foodId: 'cat',
  quantity: 100,
  unit: 'g',
  kcal: 130,
  proteinG: 3,
  carbG: 28,
  fatG: 0,
  food: { name: 'Arroz' },
  ...extra,
});

const group = (kind: DietGroupNode['kind'], choices: MealFood[][], label: string | null = null): DietGroupNode => ({
  id: `g-${kind}`,
  kind,
  label,
  order: 0,
  choices: choices.map((foods, i) => ({ id: `c${i}`, label: null, order: i, foods, nutrition: range(0) })),
  nutrition: range(0),
});

const day = (groups: DietGroupNode[], label: string | null = null): DietDayNode => ({
  id: 'd1',
  label,
  kind: 'other',
  usageNotes: null,
  order: 0,
  meals: [{ id: 'm1', name: 'Almoço', order: 0, time: null, notes: null, groups, nutrition: range(0) }],
  nutrition: range(0),
});

describe('formatação da nutrição (valores vindos da API)', () => {
  it('faixa de escolha 1: 320–350 kcal — nunca a soma das opções', () => {
    expect(formatKcal(range(320, 350))).toBe('320–350 kcal');
    expect(formatKcal(range(350))).toBe('350 kcal');
    expect(formatKcal(range(1800, 2050.4))).toBe('1.800–2.050 kcal');
  });

  it('quantidade: simples, faixa, unidade e à vontade', () => {
    expect(quantityText(food())).toBe('100 g');
    expect(quantityText(food({ quantity: 3, quantityMax: 5 }))).toBe('3–5 g');
    expect(quantityText(food({ quantity: 2, unit: 'slice' }))).toBe('2 fatia(s)');
    expect(quantityText(food({ isFreeQuantity: true, quantity: null }))).toBe('à vontade');
    expect(quantityText(food({ quantity: null, unit: null }))).toBe('');
  });

  it('item fora do catálogo, sem conversão ou à vontade não ganha kcal inventado', () => {
    expect(foodCalcStatus(food())).toBeNull();
    expect(foodCalcStatus(food({ foodId: null, customFoodName: 'Salada', kcal: null, food: null }))).toBe('Sem cálculo');
    expect(foodCalcStatus(food({ kcal: null }))).toBe('Sem cálculo');
    expect(foodCalcStatus(food({ isFreeQuantity: true, quantity: null }))).toBe('À vontade');
  });

  it('suplemento: "3–5 g" e "1 cápsula"', () => {
    expect(supplementQuantityText({ quantity: 3, quantityMax: 5, unitText: 'g' })).toBe('3–5 g');
    expect(supplementQuantityText({ quantity: 1, quantityMax: null, unitText: 'cápsula' })).toBe('1 cápsula');
  });
});

describe('dias', () => {
  it('dieta antiga (um dia sem nome, só itens fixos) não mostra abas', () => {
    const d = day([group('fixed', [[food()]])]);
    expect(isSimpleDiet([d])).toBe(true);
    expect(showDayTabs([d])).toBe(false);
  });

  it('dia com nome ou mais de um dia mostra abas; título cai no tipo quando não há nome', () => {
    expect(showDayTabs([day([], 'Dia de treino')])).toBe(true);
    expect(dayTitle({ label: null, kind: 'rest' }, 1)).toBe('Dia de descanso');
    expect(dayTitle({ label: null, kind: 'other' }, 2)).toBe('Dia 3');
  });
});

describe('pendências para publicar (mesmas regras do backend)', () => {
  it('dieta simples não tem pendência', () => {
    expect(structureProblems([day([group('fixed', [[food()]])])])).toEqual([]);
  });

  it('opções completas com outro grupo, bloco sem alternativa, escolha vazia, item sem nome e faixa invertida', () => {
    const problems = structureProblems([
      day([
        group('meal_options', [[food()]]),
        group('fixed', [[food({ foodId: null, customFoodName: '  ', food: null })]]),
        group('alternatives', [], 'Carboidrato'),
        group('alternatives', [[]], 'Proteína'),
        group('fixed', [[food({ quantity: 5, quantityMax: 3 })]]),
      ]),
    ]);
    expect(problems).toEqual([
      'Almoço: refeição com opções completas não pode ter outros grupos.',
      'Almoço: há um alimento sem nome.',
      'Almoço: bloco "escolha 1" (Carboidrato) sem nenhuma alternativa.',
      'Almoço (Proteína): opção 1 sem alimentos.',
      'Almoço: Arroz com quantidade máxima menor que a mínima.',
    ]);
  });
});

describe('validação dos formulários', () => {
  it('alimento: nome obrigatório, faixa válida, unidade para calcular; à vontade dispensa quantidade', () => {
    expect(foodItemErrors({ isFreeQuantity: false })).toContain('Informe o nome do alimento ou escolha um do catálogo.');
    expect(foodItemErrors({ customFoodName: 'Salada', isFreeQuantity: true })).toEqual([]);
    expect(foodItemErrors({ foodId: 'x', quantity: 5, quantityMax: 3, unit: 'g', isFreeQuantity: false })).toEqual([
      'A quantidade máxima não pode ser menor que a mínima.',
    ]);
    expect(foodItemErrors({ foodId: 'x', quantity: 5, isFreeQuantity: false })).toEqual(['Escolha a unidade para calcular o alimento.']);
  });

  it('suplemento: nome obrigatório e faixa válida', () => {
    expect(supplementErrors({ name: ' ' })).toEqual(['Informe o nome do suplemento.']);
    expect(supplementErrors({ name: 'Creatina', quantity: 5, quantityMax: 3 })).toEqual(['A quantidade máxima não pode ser menor que a mínima.']);
    expect(supplementErrors({ name: 'Creatina', quantity: 3, quantityMax: 5 })).toEqual([]);
  });
});

describe('reordenação', () => {
  it('renumera os irmãos e só devolve quem mudou', () => {
    const items = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ];
    expect(reorderPatches(items, 0, 1)).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ]);
    expect(reorderPatches(items, 0, -1)).toEqual([]);
  });

  it('tolera ordens repetidas (renumera tudo)', () => {
    expect(
      reorderPatches(
        [
          { id: 'a', order: 0 },
          { id: 'b', order: 0 },
          { id: 'c', order: 0 },
        ],
        2,
        1,
      ),
    ).toEqual([
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });
});
