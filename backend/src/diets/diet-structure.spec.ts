import {
  buildDietTree,
  chooseOneRange,
  flattenForLegacy,
  isSimpleStructure,
  itemRange,
  roundRange,
  structureProblems,
  type DayRow,
  type FoodRow,
  type GroupRow,
  type MealRow,
} from './diet-structure';

let seq = 0;
const food = (kcal: number | null, extra: Partial<FoodRow> = {}): FoodRow => ({
  id: `f${++seq}`,
  mealId: 'm',
  mealChoiceId: null,
  foodId: 'cat',
  customFoodName: null,
  order: seq,
  quantity: 100,
  quantityMax: null,
  isFreeQuantity: false,
  unit: 'g',
  gramsEquivalent: 100,
  kcal,
  proteinG: kcal === null ? null : kcal / 10,
  carbG: 0,
  fatG: 0,
  fiberG: 0,
  notes: null,
  food: { id: 'cat', name: `Alimento ${seq}` },
  ...extra,
});

/** Monta uma refeição com grupos: [kind, label, [[escolha label, [itens]]]]. */
function meal(id: string, dayId: string | null, groups: Array<[GroupRow['kind'], string | null, Array<[string | null, FoodRow[]]>]>, order = 0): MealRow {
  const foods: FoodRow[] = [];
  const groupRows: GroupRow[] = groups.map(([kind, label, choices], g) => ({
    id: `${id}-g${g}`,
    mealId: id,
    kind,
    label,
    order: g,
    choices: choices.map(([choiceLabel, items], c) => {
      const choiceId = `${id}-g${g}-c${c}`;
      items.forEach((item) => foods.push({ ...item, mealId: id, mealChoiceId: choiceId }));
      return { id: choiceId, mealGroupId: `${id}-g${g}`, label: choiceLabel, order: c };
    }),
  }));
  return { id, dietDayId: dayId, name: id, order, time: null, notes: null, foods, groups: groupRows };
}

const day = (id: string, label: string | null, order = 0): DayRow => ({ id, label, kind: label?.includes('treino') ? 'training' : 'other', usageNotes: null, order });

describe('nutrição em faixa — nunca soma opções/alternativas', () => {
  it('opções completas 350/320/340 → 320–350 kcal (nunca 1010)', () => {
    const tree = buildDietTree([day('d1', null)], [
      meal('Café', 'd1', [['meal_options', 'Escolha 1 opção', [['Opção 1', [food(350)]], ['Opção 2', [food(200), food(120)]], ['Opção 3', [food(340)]]]]]),
    ]);
    const cafe = tree[0].meals[0];
    expect(cafe.groups[0].choices.map((c) => c.nutrition.min.kcal)).toEqual([350, 320, 340]);
    expect([cafe.nutrition.min.kcal, cafe.nutrition.max.kcal]).toEqual([320, 350]);
  });

  it('fixo soma; blocos de alternativas viram faixa; a refeição vai da menor à maior combinação', () => {
    const tree = buildDietTree([day('d1', null)], [
      meal('Almoço', 'd1', [
        ['alternatives', 'Carboidrato', [['Arroz', [food(130)]], ['Batata', [food(90)]]]],
        ['alternatives', 'Proteína', [['Frango', [food(200)]], ['Carne', [food(250)]]]],
        ['fixed', null, [[null, [food(70), food(30)]]]],
      ]),
    ]);
    const almoco = tree[0].meals[0];
    expect(almoco.groups.map((g) => [g.nutrition.min.kcal, g.nutrition.max.kcal])).toEqual([
      [90, 130],
      [200, 250],
      [100, 100],
    ]);
    expect([almoco.nutrition.min.kcal, almoco.nutrition.max.kcal]).toEqual([390, 480]);
  });

  it('dias diferentes nunca são somados entre si', () => {
    const tree = buildDietTree(
      [day('treino', 'Dia de treino', 0), day('descanso', 'Dia de descanso', 1)],
      [meal('Ceia', 'treino', [['fixed', null, [[null, [food(300)]]]]]), meal('Ceia', 'descanso', [['fixed', null, [[null, [food(200)]]]]])],
    );
    expect(tree.map((d) => [d.label, d.nutrition.min.kcal, d.nutrition.max.kcal])).toEqual([
      ['Dia de treino', 300, 300],
      ['Dia de descanso', 200, 200],
    ]);
  });

  it('item à vontade, fora do catálogo ou sem conversão fica fora da soma e marca total parcial', () => {
    expect(itemRange(food(100, { isFreeQuantity: true, quantity: null }))).toMatchObject({ partial: true, min: { kcal: 0 } });
    expect(itemRange(food(null, { foodId: null, customFoodName: 'Salada de folhas', food: null }))).toMatchObject({ partial: true });
    expect(itemRange(food(null))).toMatchObject({ partial: true });
    const tree = buildDietTree([], [meal('Almoço', null, [['fixed', null, [[null, [food(100), food(null, { isFreeQuantity: true, quantity: null })]]]]])]);
    expect(tree[0].meals[0].nutrition).toMatchObject({ partial: true, min: { kcal: 100 }, max: { kcal: 100 } });
  });

  it('faixa de quantidade (3 a 5 g): o máximo é proporcional ao valor gravado na quantidade mínima', () => {
    const range = roundRange(itemRange(food(12, { quantity: 3, quantityMax: 5 })));
    expect([range.min.kcal, range.max.kcal]).toEqual([12, 20]);
  });

  it('escolher 1 sem nenhuma escolha não inventa valor', () => {
    expect(chooseOneRange([])).toMatchObject({ min: { kcal: 0 }, max: { kcal: 0 }, partial: false });
  });
});

describe('compatibilidade com dieta antiga', () => {
  it('sem dias/grupos (dado não convertido): tudo entra no dia único e no grupo fixo, somando como antes', () => {
    const legacy: MealRow = {
      id: 'm1',
      dietDayId: null,
      name: 'Almoço',
      order: 0,
      time: null,
      notes: null,
      groups: [],
      foods: [food(195), food(100)],
    };
    const tree = buildDietTree([], [legacy]);
    expect(isSimpleStructure(tree)).toBe(true);
    expect(tree[0].meals[0].groups[0]).toMatchObject({ kind: 'fixed', id: null });
    expect(tree[0].meals[0].nutrition.min.kcal).toBe(295);
    const flat = flattenForLegacy(tree);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ name: 'Almoço', allFixed: true });
    expect(flat[0].foods.map((f) => f.kcal)).toEqual([195, 100]);
  });

  it('formato antigo de uma dieta com opções/blocos não sugere comer tudo junto', () => {
    const tree = buildDietTree(
      [day('t', 'Dia de treino')],
      [
        meal('Café da manhã', 't', [['meal_options', null, [['Opção 1', [food(300)]], ['Opção 2', [food(280)]]]]], 0),
        meal('Almoço', 't', [['alternatives', 'Carboidrato', [['Arroz', [food(130)]], ['Batata', [food(90)]]]], ['fixed', null, [[null, [food(70)]]]]], 1),
      ],
    );
    expect(isSimpleStructure(tree)).toBe(false);
    const flat = flattenForLegacy(tree);
    expect(flat.map((m) => m.name)).toEqual([
      'Dia de treino · Café da manhã — Opção 1 (escolha 1 opção)',
      'Dia de treino · Café da manhã — Opção 2 (escolha 1 opção)',
      'Dia de treino · Almoço',
    ]);
    // Alternativas com prefixo do bloco; item fixo sem prefixo.
    expect(flat[2].foods.map((f) => f.displayName)).toEqual([
      expect.stringMatching(/^Carboidrato \(escolha 1\): Alimento \d+$/),
      expect.stringMatching(/^Carboidrato \(escolha 1\): Alimento \d+$/),
      expect.stringMatching(/^Alimento \d+$/),
    ]);
  });
});

describe('regras da estrutura (publicação)', () => {
  it('dieta simples nunca tem problema', () => {
    expect(structureProblems(buildDietTree([], [meal('Almoço', null, [['fixed', null, [[null, [food(100)]]]]])]))).toEqual([]);
  });

  it('opções completas com outro grupo, bloco sem escolha e escolha vazia são barrados', () => {
    const tree = buildDietTree([day('d', null)], [
      meal('Café', 'd', [['meal_options', null, [['Opção 1', [food(1)]]]], ['fixed', null, [[null, []]]]]),
      meal('Almoço', 'd', [['alternatives', 'Carboidrato', []], ['alternatives', 'Proteína', [['Frango', []]]]]),
    ]);
    const problems = structureProblems(tree);
    expect(problems).toEqual([
      'Café: refeição com opções completas não pode ter outros grupos.',
      'Almoço: grupo "escolher 1" (Carboidrato) sem nenhuma opção.',
      'Almoço (Proteína): Frango sem alimentos.',
    ]);
  });
});
