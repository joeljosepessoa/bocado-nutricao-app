import { readFileSync } from 'fs';
import { join } from 'path';
import type { DietClientFoodItem, DietClientGroup, DietClientSummary, MealGroupKind } from '../../types/api';
import { buildDietPresentation, foodLine, guidelineItems, mealIcon, TEXT, type SectionView } from '../dietPresentation';

/** Resposta REAL de /client/diet para a dieta da Patrícia (gerada pelo DTO do backend; nenhum item ligado ao catálogo). */
const patricia = (): DietClientSummary => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'patricia-diet.json'), 'utf8'));

const texts = (section: SectionView) => (section.kind === 'fixed' ? section.foods.map((f) => f.text) : section.choices.map((c) => c.foods.map((f) => f.text)));

const food = (foodName: string, quantity: number | null, unit: string | null, kcal: number | null, extra: Partial<DietClientFoodItem> = {}): DietClientFoodItem => ({
  foodName,
  isCustom: kcal === null,
  quantity,
  quantityMax: null,
  isFreeQuantity: false,
  unit,
  kcal,
  proteinG: kcal === null ? null : kcal / 10,
  carbG: kcal === null ? null : kcal / 5,
  fatG: kcal === null ? null : kcal / 40,
  notes: null,
  substitutions: [],
  ...extra,
});

const group = (kind: MealGroupKind, label: string | null, choices: DietClientFoodItem[][], order = 0): DietClientGroup => ({
  kind,
  label,
  order,
  nutrition: null,
  choices: choices.map((foods, i) => ({ label: kind === 'meal_options' ? `Opção ${i + 1}` : null, order: i, nutrition: null, foods })),
});

const dietWith = (groups: DietClientGroup[], extra: Partial<DietClientSummary> = {}): DietClientSummary => ({
  dietId: 'd',
  versionId: 'v',
  meals: [],
  days: [{ label: null, kind: 'other', usageNotes: null, order: 0, nutrition: null, meals: [{ name: 'Almoço', order: 0, time: '12:00', notes: null, nutrition: null, groups }] }],
  ...extra,
});

describe('Minha dieta — dieta da Patrícia (API real)', () => {
  const view = buildDietPresentation(patricia());
  const [treino, descanso] = view.days;

  it('cabeçalho só com o que existe: título e a instrução de escolha (sem meta, objetivo ou peso inventados)', () => {
    expect(view.title).toBe('Minha dieta');
    expect(view.instruction).toBe(TEXT.instruction);
    expect(Object.keys(view).sort()).toEqual(['days', 'guidelines', 'instruction', 'showDayTabs', 'supplements', 'title']);
  });

  it('dias de treino e de descanso, com ícone e instrução de uso; cada dia só com as próprias refeições', () => {
    expect(view.showDayTabs).toBe(true);
    expect(view.days.map((d) => [d.icon, d.title])).toEqual([
      ['🏋️', 'DIA DE TREINO'],
      ['🛏️', 'DIA DE DESCANSO'],
    ]);
    expect(treino.usageNotes).toBe('Usar nos 5 dias de musculação na semana. Escolher 1 opção em cada refeição ou bloco.');
    expect(treino.meals.map((m) => [m.icon, m.name])).toEqual([
      ['☕', 'CAFÉ DA MANHÃ'],
      ['☀️', 'ALMOÇO'],
      ['🥤', 'LANCHE DA TARDE (PRÉ OU PÓS-TREINO)'],
      ['🌙', 'JANTAR'],
      ['🌙', 'CEIA'],
    ]);
    expect(descanso.meals.map((m) => m.name)).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO', 'LANCHE DA TARDE', 'JANTAR', 'CEIA']);
    expect(JSON.stringify(treino)).not.toContain('abacate'); // abacate só existe no dia de descanso
  });

  it('café da manhã: ESCOLHA 1 OPÇÃO com as 3 opções separadas e linhas legíveis', () => {
    const [options] = treino.meals[0].sections;
    expect(options).toMatchObject({ kind: 'options', title: 'Escolha 1 opção' });
    expect(options.kind === 'options' && options.choices.map((c) => c.title)).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
    expect(texts(options)).toEqual([
      ['10 g de aveia', '110 g de fruta', '2 ovos', '3 claras'],
      ['20 g de aveia', '120 g de fruta', '30 g de whey protein'],
      ['2 fatias de pão integral', '2 ovos', '2 claras'],
    ]);
  });

  it('almoço: blocos CARBOIDRATO e PROTEÍNA (escolha 1) e FIXOS separados; "sem pele" aparece; salada à vontade', () => {
    const [carbo, proteina, fixos] = treino.meals[1].sections;
    expect([carbo.kind, proteina.kind, fixos.kind]).toEqual(['block', 'block', 'fixed']);
    expect(carbo).toMatchObject({ title: 'Carboidrato', instruction: 'Escolha 1' });
    expect(texts(carbo)).toEqual([['65 g de arroz'], ['160 g de batata inglesa'], ['65 g de aipim'], ['110 g de batata-doce'], ['120 g de polenta']]);
    expect(texts(proteina)).toEqual([['120 g de peito de frango'], ['145 g de carne vermelha magra'], ['135 g de filé mignon suíno'], ['150 g de sobrecoxa']]);
    expect(proteina.kind === 'block' && proteina.choices[3].foods[0]).toMatchObject({ text: '150 g de sobrecoxa', notes: 'Sem pele' });
    expect(fixos).toMatchObject({ kind: 'fixed', title: 'Fixos' });
    expect(fixos.kind === 'fixed' && fixos.foods.map((f) => [f.text, f.quantityNote])).toEqual([
      ['50 g de feijão', null],
      ['100 g de legumes', null],
      ['Salada de folhas', 'À vontade'],
      ['4 g de azeite', null],
    ]);
  });

  it('alternativa com 2 alimentos fica junta (dia de descanso: frango + azeite); ceia só com fixos vira lista simples', () => {
    const [proteina] = descanso.meals[1].sections;
    expect(texts(proteina)[0]).toEqual(['135 g de peito de frango', '10 g de azeite']);
    const [ceia] = treino.meals[4].sections;
    expect(ceia).toMatchObject({ kind: 'fixed', title: null });
    expect(texts(ceia)).toEqual(['100 g de Danone natural', '10 g de aveia', '5 g de amêndoas', '15 g de whey protein']);
  });

  it('sem cálculo: NUNCA "0 kcal", nem faixa falsa, nem "Sem cálculo" por linha — só um aviso discreto por dia', () => {
    const all = JSON.stringify(view);
    expect(all).not.toMatch(/\b0 kcal|0–\d+ kcal|Sem cálculo|Total parcial|Itens fixos|Consumir todos/);
    for (const day of view.days) {
      expect(day.calories).toEqual({ status: 'unavailable', text: null, macros: null });
      expect(day.calorieNote).toBe('Informação calórica indisponível.');
      for (const meal of day.meals) expect(meal.calories.text).toBeNull();
    }
  });

  it('suplementação organizada (nome, dose, momento, observação) e orientações em tópicos', () => {
    expect(view.supplements).toEqual([
      { name: 'Creatina', dose: '3–5 g', timing: 'Antes do café da manhã', notes: 'Também nos dias sem treino' },
      { name: 'Ômega-3', dose: '1 cápsula', timing: 'No almoço e 1 cápsula no jantar', notes: 'Junto com a refeição' },
      { name: 'Whey protein', dose: null, timing: null, notes: 'Nas porções indicadas em cada refeição' },
    ]);
    expect(view.guidelines).toHaveLength(8);
    expect(view.guidelines[0]).toBe('Água: no mínimo 2,5 litros por dia.');
    expect(view.guidelines.at(-1)).toBe('Evite ultraprocessados, frituras e açúcar. Durma de 7 a 9 horas por noite.');
  });
});

describe('calorias: calculado, parcial e sem dados', () => {
  it('tudo calculado: opções mostram kcal e a refeição a faixa (menor e maior opção — nunca a soma)', () => {
    const view = buildDietPresentation(dietWith([group('meal_options', null, [[food('aveia', 30, 'g', 120), food('ovos', 2, null, 230)], [food('whey', 30, 'g', 320)]])]));
    const meal = view.days[0].meals[0];
    const [options] = meal.sections;
    expect(options.kind === 'options' && options.choices.map((c) => c.calories.text)).toEqual(['350 kcal', '320 kcal']);
    expect(meal.calories).toMatchObject({ status: 'calculated', text: '320–350 kcal' });
    expect(meal.calories.macros).toBe('Proteína 32–35 g · Carboidrato 64–70 g · Gordura 8–9 g');
    expect(view.days[0]).toMatchObject({ calories: { status: 'calculated', text: '320–350 kcal' }, calorieNote: null });
  });

  it('opção sem dados NÃO vira mínimo 0: faixa some e o dia avisa uma vez que o cálculo é parcial', () => {
    const view = buildDietPresentation(
      dietWith([group('meal_options', null, [[food('aveia', 10, 'g', 39), food('fruta', 110, 'g', 131)], [food('pão integral', 2, 'slice', null)]])]),
    );
    const meal = view.days[0].meals[0];
    expect(meal.calories).toEqual({ status: 'partial', text: null, macros: null });
    const [options] = meal.sections;
    expect(options.kind === 'options' && options.choices.map((c) => c.calories.status)).toEqual(['calculated', 'unavailable']);
    expect(view.days[0].calorieNote).toBe(TEXT.partialNote);
    expect(JSON.stringify(view)).not.toMatch(/0–\d+ kcal|\b0 kcal/);
  });

  it('parcial com piso real: "a partir de X kcal" (o que tem cálculo é um mínimo verdadeiro)', () => {
    const view = buildDietPresentation(dietWith([group('fixed', null, [[food('feijão', 100, 'g', 76), food('legumes', 100, 'g', null)]])]));
    expect(view.days[0].meals[0].calories).toEqual({ status: 'partial', text: 'a partir de 76 kcal', macros: null });
  });

  it('"à vontade" não conta como falta de cálculo; faixa de quantidade escala o máximo', () => {
    const view = buildDietPresentation(
      dietWith([
        group('fixed', null, [[food('arroz', 100, 'g', 130), food('salada de folhas', null, null, null, { isFreeQuantity: true }), food('creatina', 3, 'g', 12, { quantityMax: 5 })]]),
      ]),
    );
    expect(view.days[0].meals[0].calories).toMatchObject({ status: 'calculated', text: '142–150 kcal' });
  });

  it('kcal presente mas macro sem número (marcador da TACO): mostra kcal, esconde macros', () => {
    const view = buildDietPresentation(dietWith([group('fixed', null, [[food('azeite', 10, 'g', 88, { proteinG: null, carbG: null })]])]));
    expect(view.days[0].meals[0].calories).toEqual({ status: 'calculated', text: '88 kcal', macros: null });
  });

  it('alimento nunca mostra kcal na linha', () => {
    expect(Object.keys(foodLine(food('arroz', 100, 'g', 130))).sort()).toEqual(['notes', 'quantityNote', 'substitutions', 'text']);
  });
});

describe('linha de alimento', () => {
  it('g/ml, medidas caseiras (singular/plural), sem unidade, faixa e só nome', () => {
    expect(foodLine(food('fruta', 110, 'g', null)).text).toBe('110 g de fruta');
    expect(foodLine(food('leite', 200, 'ml', null)).text).toBe('200 ml de leite');
    expect(foodLine(food('pão integral', 1, 'slice', null)).text).toBe('1 fatia de pão integral');
    expect(foodLine(food('pão integral', 2, 'slice', null)).text).toBe('2 fatias de pão integral');
    expect(foodLine(food('azeite', 1, 'tablespoon', null)).text).toBe('1 colher de sopa de azeite');
    expect(foodLine(food('aveia', 1.5, 'tablespoon', null)).text).toBe('1,5 colheres de sopa de aveia');
    expect(foodLine(food('ovos', 2, null, null)).text).toBe('2 ovos');
    expect(foodLine(food('ovos', 2, 'unit', null)).text).toBe('2 ovos');
    expect(foodLine(food('creatina', 3, 'g', null, { quantityMax: 5 })).text).toBe('3–5 g de creatina');
    expect(foodLine(food('molho caseiro', null, null, null)).text).toBe('Molho caseiro');
    expect(foodLine(food('chá', 1, 'sachê', null)).text).toBe('1 sachê de chá');
  });

  it('observação e quantidade livre aparecem; nunca "0 g"', () => {
    expect(foodLine(food('sobrecoxa', 150, 'g', null, { notes: 'sem pele' }))).toMatchObject({ text: '150 g de sobrecoxa', notes: 'Sem pele' });
    const salad = foodLine(food('salada de folhas', null, null, null, { isFreeQuantity: true }));
    expect(salad).toMatchObject({ text: 'Salada de folhas', quantityNote: 'À vontade' });
    expect(salad.text).not.toMatch(/\b0 g/);
  });

  it('ícones de refeição consistentes', () => {
    expect(['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Pré-treino', 'Refeição livre'].map(mealIcon)).toEqual([
      '☕',
      '🥤',
      '☀️',
      '🥤',
      '🌙',
      '🌙',
      '⚡',
      '🍽️',
    ]);
  });
});

describe('compatibilidade e dados incompletos', () => {
  it('API antiga (só "meals"): um dia sem abas, lista simples e total calculado pelos itens', () => {
    const view = buildDietPresentation({
      dietId: 'd',
      versionId: 'v',
      meals: [{ name: 'Almoço', order: 0, time: '12:00', notes: 'Mastigar devagar', foods: [{ foodName: 'Arroz', quantity: 100, unit: 'g', kcal: 130, proteinG: 2.7, carbG: 28, fatG: 0.3, substitutions: [] }] }],
    });
    expect(view.showDayTabs).toBe(false);
    expect(view.instruction).toBeNull();
    const meal = view.days[0].meals[0];
    expect(meal).toMatchObject({ icon: '☀️', name: 'Almoço', time: '12:00', notes: 'Mastigar devagar', calories: { status: 'calculated', text: '130 kcal' } });
    expect(meal.sections).toEqual([{ kind: 'fixed', title: null, foods: [expect.objectContaining({ text: '100 g de Arroz', notes: null })] }]);
    expect(view.supplements).toEqual([]);
    expect(view.guidelines).toEqual([]);
  });

  it('grupo/escolha vazios são omitidos; sem horário/observação ficam null; sem orientações não cria seção', () => {
    const view = buildDietPresentation(
      dietWith([group('alternatives', 'Proteína', [[], [food('frango', 120, 'g', null)]]), group('fixed', null, [[]], 1)], { patientGuidelines: '  \n ' }),
    );
    const meal = view.days[0].meals[0];
    expect(meal.sections).toEqual([expect.objectContaining({ kind: 'block', title: 'Proteína', choices: [expect.objectContaining({ title: null })] })]);
    expect(view.guidelines).toEqual([]);
  });

  it('orientações: um tópico por linha, sem o marcador digitado', () => {
    expect(guidelineItems('* Água: 2,5 L\n- Salada à vontade\n\n1. Evitar frituras\n• Dormir bem')).toEqual(['Água: 2,5 L', 'Salada à vontade', 'Evitar frituras', 'Dormir bem']);
  });
});
