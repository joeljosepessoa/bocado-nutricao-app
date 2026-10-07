import { AiOutputValidationError } from '../../ai-errors';
import { checkDietFidelity, DIET_WARNINGS, itemCore, mapUnit, normalizeDietText, parseMealTime, quantitySpellings } from './diet-fidelity';
import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from './organized-diet.schema';
import { faithfulUserDiet, it_ as item, USER_EXAMPLE_DIET, wholeLineUserDiet } from '../../../../test/fixtures/user-example-diet';

const TEXT = [
  'CAFÉ DA MANHÃ',
  '2 fatias de pão integral',
  '4 ovos inteiros',
  '4 claras',
  '150 g de fruta',
  '',
  'ALMOÇO',
  '150 g arroz',
  '100 g feijão',
  '150 g frango',
  'salada',
].join('\n');

const fixed = (items: AiDietItem[]): AiGroup => ({ kind: 'fixed', label: null, choices: [{ label: null, items }] });
const meal = (name: string | null, items: AiDietItem[], extra: Partial<AiMeal> = {}): AiMeal => ({ name, time: null, notes: null, groups: [fixed(items)], ...extra });
const diet = (meals: AiMeal[], extra: Partial<AiOrganizedDiet> = {}): AiOrganizedDiet => ({
  days: [{ label: null, kind: 'other', usageNotes: null, meals }],
  supplements: [],
  guidelines: [],
  warnings: [],
  ...extra,
});

const faithful = (): AiOrganizedDiet =>
  diet([
    meal('CAFÉ DA MANHÃ', [
      item('2 fatias de pão integral', 'Pão integral', 2, 'fatias'),
      item('4 ovos inteiros', 'Ovo inteiro', 4, null),
      item('4 claras', 'Clara', 4, null),
      item('150 g de fruta', 'Fruta', 150, 'g'),
    ]),
    meal('ALMOÇO', [item('150 g arroz', 'Arroz', 150, 'g'), item('100 g feijão', 'Feijão', 100, 'g'), item('150 g frango', 'Frango', 150, 'g'), item('salada', 'Salada', null, null)]),
  ]);

const items = (organized: AiOrganizedDiet, m = 0) => organized.days[0].meals[m].groups[0].choices[0].items;

function rejection(organized: AiOrganizedDiet, text = TEXT): string {
  try {
    checkDietFidelity(text, organized);
  } catch (error) {
    expect(error).toBeInstanceOf(AiOutputValidationError);
    return (error as Error).message;
  }
  throw new Error('deveria ter recusado');
}

describe('checkDietFidelity — a IA só organiza, nunca altera a prescrição', () => {
  it('organiza sem alterar alimentos, quantidades nem unidades', () => {
    const checked = checkDietFidelity(TEXT, faithful());
    expect(checked.days[0].meals.map((m) => m.name)).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO']);
    const breakfast = checked.days[0].meals[0].groups[0].choices[0].items;
    expect(breakfast.map((i) => [i.rawFood, i.quantity, i.unit])).toEqual([
      ['Pão integral', 2, 'slice'],
      ['Ovo inteiro', 4, 'unit'],
      ['Clara', 4, 'unit'],
      ['Fruta', 150, 'g'],
    ]);
    expect(breakfast[1].warnings).toContain(DIET_WARNINGS.unitAssumed);
    expect(checked.days[0].meals[1].groups[0].choices[0].items[3].warnings).toContain(DIET_WARNINGS.quantityMissing);
    expect(checked.warnings).toEqual([]);
  });

  it('quantidade alterada (150 g → 200 g, 4 ovos → 2) é recusada', () => {
    const changed = faithful();
    items(changed)[3] = item('150 g de fruta', 'Fruta', 200, 'g');
    expect(rejection(changed)).toMatch(/quantidade 200 não está escrita/);

    const fewer = faithful();
    items(fewer)[1] = item('4 ovos inteiros', 'Ovo inteiro', 2, null);
    expect(rejection(fewer)).toMatch(/quantidade 2 não está escrita/);
  });

  it('alimento trocado (fruta → banana) ou inventado é recusado', () => {
    const swapped = faithful();
    items(swapped)[3] = item('150 g de fruta', 'Banana', 150, 'g');
    expect(rejection(swapped)).toMatch(/alimento "Banana" não corresponde/);

    const invented = faithful();
    items(invented, 1).push(item('1 colher de azeite', 'Azeite', 1, 'colher de sopa'));
    expect(rejection(invented)).toMatch(/trecho "1 colher de azeite" não está no texto/);
  });

  it('refeição acrescentada (sem origem no texto) é recusada', () => {
    const extraMeal = faithful();
    extraMeal.days[0].meals.push(meal('CEIA', [item('salada', 'Salada', null, null)]));
    expect(rejection(extraMeal)).toMatch(/refeição "CEIA" não está no texto/);
  });

  it('item repetido além do que está escrito é recusado', () => {
    const duplicated = faithful();
    items(duplicated, 1).push(item('150 g frango', 'Frango', 150, 'g'));
    expect(rejection(duplicated)).toMatch(/"150 g frango" foi usado mais vezes do que aparece/);
  });

  it('unidade alterada (g → kg) é recusada; kg escrito vira aviso de unidade não suportada', () => {
    const changed = faithful();
    items(changed, 1)[0] = item('150 g arroz', 'Arroz', 150, 'kg');
    expect(rejection(changed)).toMatch(/unidade "kg" não está escrita/);

    const kg = checkDietFidelity('ALMOÇO\n1 kg de batata', diet([meal('ALMOÇO', [item('1 kg de batata', 'Batata', 1, 'kg')])]));
    const potato = kg.days[0].meals[0].groups[0].choices[0].items[0];
    expect(potato.unit).toBeNull();
    expect(potato.warnings).toContain(DIET_WARNINGS.unitUnsupported('kg'));
  });

  it('alimento omitido pela IA não some: vira aviso "Trecho não organizado"', () => {
    const missing = faithful();
    items(missing, 1).splice(1, 1); // tira o feijão
    expect(checkDietFidelity(TEXT, missing).warnings).toEqual([DIET_WARNINGS.uncovered('100 g feijão')]);
  });

  it('dieta em linha única com vírgulas e "e" é coberta sem avisos', () => {
    const text = 'Café da manhã: 2 fatias de pão integral, 4 ovos inteiros, 4 claras e 150g de fruta';
    const checked = checkDietFidelity(
      text,
      diet([
        meal('Café da manhã', [
          item('2 fatias de pão integral', 'Pão integral', 2, 'fatias'),
          item('4 ovos inteiros', 'Ovo inteiro', 4, null),
          item('4 claras', 'Clara', 4, null),
          item('150g de fruta', 'Fruta', 150, 'g'),
        ]),
      ]),
    );
    expect(checked.warnings).toEqual([]);
    expect(checked.days[0].meals[0].groups[0].choices[0].items.map((i) => i.quantity)).toEqual([2, 4, 4, 150]);
  });

  it('horário só se escrito; observação reescrita é descartada com aviso', () => {
    const text = 'ALMOÇO 12h30\n150 g arroz (sem sal)';
    const checked = checkDietFidelity(text, diet([meal('ALMOÇO', [item('150 g arroz', 'Arroz', 150, 'g', { notes: 'pouco sal' })], { time: '12h30' })]));
    expect(checked.days[0].meals[0].time).toBe('12:30');
    const rice = checked.days[0].meals[0].groups[0].choices[0].items[0];
    expect(rice.notes).toBeNull();
    expect(rice.warnings).toContain(DIET_WARNINGS.noteDiscarded);
    expect(rejection(diet([meal('ALMOÇO', [item('150 g arroz', 'Arroz', 150, 'g')], { time: '13h' })]), text)).toMatch(/horário "13h" não está no texto/);
  });
});

describe('v2 — a dieta real do profissional (dia de treino/descanso, opções, blocos, suplementos, orientações)', () => {
  it('é aceita inteira, sem nenhum aviso, com a estrutura preservada', () => {
    const checked = checkDietFidelity(USER_EXAMPLE_DIET, faithfulUserDiet());
    expect(checked.warnings).toEqual([]);
    expect(checked.days.map((d) => [d.label, d.kind, d.meals.length])).toEqual([
      ['DIA DE TREINO', 'training', 5],
      ['DIA DE DESCANSO', 'rest', 5],
    ]);
    const [cafe, almoco] = checked.days[0].meals;
    expect(cafe.groups.map((g) => g.kind)).toEqual(['meal_options']);
    expect(cafe.groups[0].choices.map((c) => [c.label, c.items.map((i) => `${i.quantity} ${i.rawFood}`)])).toEqual([
      ['Opção 1', ['10 aveia', '110 fruta', '2 ovo', '3 clara']],
      ['Opção 2', ['20 aveia', '120 fruta', '30 whey protein']],
      ['Opção 3', ['2 pão integral', '2 ovo', '2 clara']],
    ]);
    expect(almoco.groups.map((g) => [g.kind, g.label, g.choices.length])).toEqual([
      ['alternatives', 'Carboidrato', 5],
      ['alternatives', 'Proteína', 4],
      ['fixed', null, 1],
    ]);
    const salad = almoco.groups[2].choices[0].items[2];
    expect(salad).toMatchObject({ rawFood: 'salada de folhas', freeQuantity: true, quantity: null, unit: null });
    expect(salad.warnings).not.toContain(DIET_WARNINGS.quantityMissing);
    // Alternativa com 2 alimentos fica na MESMA escolha.
    expect(checked.days[1].meals[1].groups[0].choices[0].items.map((i) => `${i.quantity} g ${i.rawFood}`)).toEqual(['135 g peito de frango', '10 g azeite']);
    expect(checked.supplements[0]).toMatchObject({ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: 'antes do café da manhã' });
    expect(checked.guidelines).toHaveLength(8);
  });

  it('texto copiado de PDF com linha quebrada no meio do alimento ("120 g de" ↵ "polenta") não gera aviso de trecho não organizado', () => {
    const wrapped = USER_EXAMPLE_DIET.replace(/\* /g, '• ')
      .replace(/\/ 120 g de polenta\./g, '/ 120 g de\npolenta.')
      .replace(/\/ 150 g de sobrecoxa sem pele\./g, '/ 150 g\nde sobrecoxa sem pele.')
      .replace(/\/ 145 g de filé mignon suíno \+ 8 g de azeite/g, '/ 145\ng de filé mignon suíno + 8 g de azeite');
    expect(wrapped).toContain('120 g de\npolenta');
    expect(checkDietFidelity(wrapped, faithfulUserDiet()).warnings).toEqual([]);
    // Texto estranho de verdade (ex.: rodapé do PDF) continua sendo avisado.
    expect(checkDietFidelity(`${wrapped}\nBOCADODENUTRIÇÃO`, faithfulUserDiet()).warnings).toEqual([DIET_WARNINGS.uncovered('BOCADODENUTRIÇÃO')]);
  });

  it('regressão do falso positivo: a linha inteira em cada item e "2 ovos" repetido no café e no lanche são aceitos', () => {
    expect(() => checkDietFidelity(USER_EXAMPLE_DIET, wholeLineUserDiet())).not.toThrow();
  });

  it('quantidade trocada dentro da mesma linha ("2 ovos + 3 claras" → 2 claras) é recusada', () => {
    const swapped = wholeLineUserDiet();
    const claras = swapped.days[0].meals[0].groups[0].choices[0].items[3];
    claras.quantity = 2;
    expect(rejection(swapped, USER_EXAMPLE_DIET)).toMatch(/quantidade 2 não está junto de "clara"/);
  });

  it('opções misturadas (item da Opção 2 dentro da Opção 1) são recusadas', () => {
    const mixed = faithfulUserDiet();
    const [op1, op2] = mixed.days[0].meals[0].groups[0].choices;
    op1.items.push(op2.items.pop()!);
    expect(rejection(mixed, USER_EXAMPLE_DIET)).toMatch(/"30 g de whey protein" não faz parte da Opção 1 no texto \(opções misturadas\)/);
  });

  it('alternativas ("/") viradas itens fixos são recusadas', () => {
    const merged = faithfulUserDiet();
    const almoco = merged.days[0].meals[1];
    const carbo = almoco.groups.shift()!;
    almoco.groups[1].choices[0].items.push(...carbo.choices.slice(0, 2).flatMap((c) => c.items));
    expect(rejection(merged, USER_EXAMPLE_DIET)).toMatch(/"65 g de arroz" e "160 g de batata inglesa" são alternativas no texto .* como itens fixos/);
  });

  it('itens ligados por "+" separados em alternativas diferentes são recusados', () => {
    const split = faithfulUserDiet();
    const proteina = split.days[1].meals[1].groups[0];
    const oil = proteina.choices[0].items.pop()!; // 10 g de azeite sai do frango
    proteina.choices.push({ label: null, items: [oil] });
    expect(rejection(split, USER_EXAMPLE_DIET)).toMatch(/"135 g de peito de frango" e "10 g de azeite" aparecem juntos no texto/);
  });

  it('rótulos inventados (dia, bloco, opção) e orientação reescrita são recusados', () => {
    const day = faithfulUserDiet();
    day.days[1].label = 'DIA DE FOLGA';
    expect(rejection(day, USER_EXAMPLE_DIET)).toMatch(/o dia "DIA DE FOLGA" não está no texto/);

    const block = faithfulUserDiet();
    block.days[0].meals[1].groups[0].label = 'Carboidratos complexos';
    expect(rejection(block, USER_EXAMPLE_DIET)).toMatch(/o bloco "Carboidratos complexos" não está no texto/);

    const option = faithfulUserDiet();
    option.days[0].meals[0].groups[0].choices[0].label = 'Opção A';
    expect(rejection(option, USER_EXAMPLE_DIET)).toMatch(/a opção "Opção A" não está no texto/);

    const guideline = faithfulUserDiet();
    guideline.guidelines[0] = 'Beba bastante água ao longo do dia.';
    expect(rejection(guideline, USER_EXAMPLE_DIET)).toMatch(/Orientação 1: "Beba bastante água ao longo do dia\." não está escrita assim/);
  });

  it('"à vontade" não escrito e item repetido além do texto são recusados', () => {
    const free = faithfulUserDiet();
    const feijao = free.days[0].meals[1].groups[2].choices[0].items[0];
    Object.assign(feijao, { quantity: null, unit: null, freeQuantity: true });
    expect(rejection(free, USER_EXAMPLE_DIET)).toMatch(/"à vontade" não está escrito em "50 g de feijão"/);

    const extra = faithfulUserDiet();
    extra.days[0].meals[4].groups[0].choices[0].items.push(item('2 ovos', 'ovo', 2, null));
    expect(rejection(extra, USER_EXAMPLE_DIET)).toMatch(/"2 ovos" foi usado mais vezes do que aparece no texto/);
  });

  it('suplemento: faixa 3 a 5 g aceita; máximo alterado recusado; momento reescrito descartado com aviso', () => {
    const changed = faithfulUserDiet();
    changed.supplements[0].quantityMax = 6;
    expect(rejection(changed, USER_EXAMPLE_DIET)).toMatch(/quantidade máxima 6 não está escrita/);

    const timing = faithfulUserDiet();
    timing.supplements[0].timing = 'em jejum';
    const checked = checkDietFidelity(USER_EXAMPLE_DIET, timing);
    expect(checked.supplements[0].timing).toBeNull();
    expect(checked.supplements[0].warnings).toContain(DIET_WARNINGS.timingDiscarded);
  });
});

describe('v2 — regras da estrutura', () => {
  const text = 'ALMOÇO\n150 g arroz\n100 g feijão';

  it('"escolha 1" sem indicação no texto é recusado', () => {
    const organized = diet([
      {
        name: 'ALMOÇO',
        time: null,
        notes: null,
        groups: [{ kind: 'alternatives', label: null, choices: [{ label: null, items: [item('150 g arroz', 'Arroz', 150, 'g')] }, { label: null, items: [item('100 g feijão', 'Feijão', 100, 'g')] }] }],
      },
    ]);
    expect(rejection(organized, text)).toMatch(/foi marcado como "escolha 1", mas o texto não indica escolha/);
  });

  it('opções completas junto com outro bloco são recusadas', () => {
    const organized = diet([
      {
        name: 'ALMOÇO',
        time: null,
        notes: null,
        groups: [{ kind: 'meal_options', label: null, choices: [{ label: null, items: [item('150 g arroz', 'Arroz', 150, 'g')] }] }, fixed([item('100 g feijão', 'Feijão', 100, 'g')])],
      },
    ]);
    expect(rejection(organized, text)).toMatch(/opções completas não pode ter outros blocos/);
  });
});

describe('trecho mínimo do item (quantidade colada no alimento)', () => {
  const core = (sourceText: string, food: string, quantity: number | null, unit: string | null = null, extra: Partial<AiDietItem> = {}) =>
    itemCore({ sourceText, food, quantity, unit, quantityMax: null, freeQuantity: false, ...extra });

  it('acha o trecho certo dentro da linha inteira', () => {
    expect(core('2 ovos + 3 claras', 'clara', 3)).toBe('3 claras');
    expect(core('2 ovos + 3 claras', 'ovo', 2)).toBe('2 ovos');
    expect(core('Opção 3: 2 fatias de pão integral + 2 ovos', 'pão integral', 2, 'fatias')).toBe('2 fatias de pao integral');
  });

  it('recusa quantidade de outro alimento', () => {
    expect(core('2 ovos + 3 claras', 'clara', 2)).toBeNull();
    expect(core('2 ovos + 3 claras', 'ovo', 3)).toBeNull();
  });

  it('aceita quantidade depois do alimento, medida caseira entre parênteses, faixa e à vontade', () => {
    expect(core('Arroz 150g', 'arroz', 150, 'g')).toBe('arroz 150 g');
    expect(core('1 scoop (30 g) de whey', 'whey', 30, 'g')).toBe('30 g de whey');
    expect(core('3 a 5 g de creatina', 'creatina', 3, 'g', { quantityMax: 5 })).toBe('3 a 5 g de creatina');
    expect(core('salada de folhas à vontade', 'salada de folhas', null, null, { freeQuantity: true })).toBe('salada de folhas a vontade');
  });
});

describe('auxiliares de fidelidade', () => {
  it('normaliza só forma (acento, caixa, número colado na unidade, decimal com vírgula)', () => {
    expect(normalizeDietText('150g de Feijão')).toBe('150 g de feijao');
    expect(normalizeDietText('1,5 xícara')).toBe('1.5 xicara');
  });

  it('grafias aceitas para quantidades nunca incluem outro número', () => {
    expect(quantitySpellings(0.5)).toEqual(expect.arrayContaining(['0.5', '1/2', 'meia']));
    expect(quantitySpellings(2)).toEqual(expect.arrayContaining(['2', 'dois', 'duas']));
    expect(quantitySpellings(200)).toEqual(['200']);
  });

  it('mapeia grafias de unidade sem converter valor', () => {
    expect(mapUnit('Colher de sopa')).toBe('tablespoon');
    expect(mapUnit('fatias')).toBe('slice');
    expect(mapUnit('kg')).toBeNull();
    expect(mapUnit('concha')).toBeNull();
  });

  it('horário escrito vira HH:mm; formato desconhecido fica null', () => {
    expect(parseMealTime('7h')).toBe('07:00');
    expect(parseMealTime('12:30')).toBe('12:30');
    expect(parseMealTime('depois do treino')).toBeNull();
  });
});
