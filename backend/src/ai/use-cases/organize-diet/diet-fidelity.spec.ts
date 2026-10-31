import { AiOutputValidationError } from '../../ai-errors';
import { checkDietFidelity, DIET_WARNINGS, itemCore, mapUnit, normalizeDietText, parseMealTime, quantitySpellings } from './diet-fidelity';
import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from './organized-diet.schema';
import { faithfulUserDiet, it_ as item, USER_EXAMPLE_DIET, wholeLineUserDiet } from '../../../../test/fixtures/user-example-diet';
import { faithfulOptionsDiet, leanMeat, OPTIONS_EXAMPLE_DIET } from '../../../../test/fixtures/options-example-diet';
import { hardWrap } from '../../../../test/fixtures/hard-wrap';
import { CHOOSE_ONE_LINES_DIET, CHOOSE_ONE_LINES_DIET_UNNUMBERED, faithfulChooseOneLinesDiet } from '../../../../test/fixtures/choose-one-lines-diet';

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
/** Todos os itens, de todos os dias/refeições/blocos/escolhas, na ordem. */
const allItems = <T>(days: Array<{ meals: Array<{ groups: Array<{ choices: Array<{ items: T[] }> }> }> }>): T[] =>
  days.flatMap((d) => d.meals.flatMap((m) => m.groups.flatMap((g) => g.choices.flatMap((c) => c.items))));

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
    const written = faithfulUserDiet();
    // A proposta inteira, campo a campo, contra o que está escrito na dieta.
    expect(checked.days.map((d) => [d.label, d.kind, d.usageNotes, d.warnings])).toEqual(written.days.map((d) => [d.label, d.kind, d.usageNotes, []]));
    expect(checked.days.map((d) => d.meals.map((m) => [m.name, m.time, m.notes, m.warnings]))).toEqual(written.days.map((d) => d.meals.map((m) => [m.name, null, null, []])));
    expect(checked.days.map((d) => d.meals.map((m) => m.groups.map((g) => [g.kind, g.label, g.choices.map((c) => [c.label, c.items.length])])))).toEqual(
      written.days.map((d) => d.meals.map((m) => m.groups.map((g) => [g.kind, g.label, g.choices.map((c) => [c.label, c.items.length])]))),
    );
    const keptItems = allItems(checked.days);
    expect(keptItems.map((i) => [i.sourceText, i.rawFood, i.quantity, i.quantityMax, i.unitText, i.freeQuantity, i.notes])).toEqual(
      allItems(written.days).map((i) => [i.sourceText, i.food, i.quantity, i.quantityMax, i.unit, i.freeQuantity, i.notes]),
    );
    expect(keptItems).toHaveLength(93);
    // Unidade do sistema: só tradução da grafia; sem unidade escrita vira "unidade" com aviso; "à vontade" fica sem unidade.
    expect([...new Set(keptItems.map((i) => `${i.unitText} → ${i.unit}`))].sort()).toEqual(['fatias → slice', 'g → g', 'null → null', 'null → unit']);
    for (const kept of keptItems) {
      expect(kept.warnings).toEqual(kept.quantity !== null && kept.unitText === null ? [DIET_WARNINGS.unitAssumed] : []);
    }
    expect(checked.supplements.map(({ unitText, warnings, ...supplement }) => [{ ...supplement, unit: unitText }, warnings])).toEqual(written.supplements.map((s) => [s, []]));
    expect(checked.guidelines).toEqual(written.guidelines);
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

  it.each([
    ['ou dentro de parênteses', '95 g de carne magra (patinho ou coxão mole)', 'carne magra', 95, 'g'],
    ['ou dentro de parênteses no preparo', '150 g de frango (grelhado ou assado)', 'frango', 150, 'g'],
  ] as const)('preserva como um único alimento quando há %s', (_label, sourceText, food, quantity, unit) => {
    const text = `ALMOÇO\n${sourceText} + 90 g de arroz`;
    const organized = diet([
      meal('ALMOÇO', [item(sourceText, food, quantity, unit), item('90 g de arroz', 'arroz', 90, 'g')]),
    ]);

    const checked = checkDietFidelity(text, organized);
    const checkedItems = checked.days[0].meals[0].groups[0].choices[0].items;
    expect(checkedItems.map(({ sourceText: source, rawFood, quantity: amount, unit: mappedUnit }) => [source, rawFood, amount, mappedUnit])).toEqual([
      [sourceText, food, quantity, unit],
      ['90 g de arroz', 'arroz', 90, 'g'],
    ]);
    expect(checked.warnings).toEqual([]);
  });

  it('preserva como um alimento único a barra dentro de parênteses', () => {
    const sourceText = '130 g de peixe (tilápia / merluza)';
    const checked = checkDietFidelity(
      `ALMOÇO\n${sourceText}`,
      diet([meal('ALMOÇO', [item(sourceText, 'peixe', 130, 'g')])]),
    );
    expect(checked.days[0].meals[0].groups[0].choices[0].items[0]).toMatchObject({
      sourceText,
      rawFood: 'peixe',
      quantity: 130,
      unit: 'g',
    });
    expect(checked.warnings).toEqual([]);
  });

  it('continua tratando a barra fora de parênteses como alternativa real', () => {
    const text = 'ALMOÇO\nPROTEÍNA (escolher 1): 120 g de frango / 130 g de peixe';
    const organized = diet([
      meal('ALMOÇO', [], {
        groups: [
          {
            kind: 'alternatives',
            label: 'PROTEÍNA',
            choices: [
              { label: null, items: [item('120 g de frango', 'frango', 120, 'g')] },
              { label: null, items: [item('130 g de peixe', 'peixe', 130, 'g')] },
            ],
          },
        ],
      }),
    ]);
    expect(checkDietFidelity(text, organized).warnings).toEqual([]);
  });

  it('não considera barra ou "ou" entre parênteses um marcador de escolha', () => {
    const text = 'ALMOÇO\n130 g de peixe (tilápia / merluza)';
    const organized = diet([
      meal('ALMOÇO', [], {
        groups: [
          {
            kind: 'alternatives',
            label: null,
            choices: [{ label: null, items: [item('130 g de peixe (tilápia / merluza)', 'peixe', 130, 'g')] }],
          },
        ],
      }),
    ]);
    expect(rejection(organized, text)).toMatch(/o texto não indica escolha/);
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

  it('mesmo par junto numa refeição e como alternativas em outra: vale a linha do próprio bloco', () => {
    // Caso real: "35 g de aveia + … 150 g de banana" no café e "150 g de banana / … / 35 g de aveia" no acréscimo.
    const text = [
      'CAFÉ DA MANHÃ',
      '35 g de aveia + 100 ml de leite + 150 g de banana',
      '',
      'LANCHE DA TARDE',
      'Acréscimo (escolher 1): 150 g de banana / 50 g de pão integral (2 fatias) / 35 g de aveia.',
    ].join('\n');
    const snack: AiGroup = {
      kind: 'alternatives',
      label: 'Acréscimo',
      choices: [
        { label: null, items: [item('150 g de banana', 'banana', 150, 'g')] },
        { label: null, items: [{ ...item('50 g de pão integral', 'pão integral', 50, 'g'), notes: '2 fatias' }] },
        { label: null, items: [item('35 g de aveia', 'aveia', 35, 'g')] },
      ],
    };
    const organized = diet([
      meal('CAFÉ DA MANHÃ', [item('35 g de aveia', 'aveia', 35, 'g'), item('100 ml de leite', 'leite', 100, 'ml'), item('150 g de banana', 'banana', 150, 'g')]),
      { name: 'LANCHE DA TARDE', time: null, notes: null, groups: [snack] },
    ]);
    expect(() => checkDietFidelity(text, organized)).not.toThrow();

    // No café, onde estão juntos, separar continua recusado.
    const splitBreakfast = diet([
      {
        name: 'CAFÉ DA MANHÃ',
        time: null,
        notes: null,
        groups: [
          {
            kind: 'alternatives',
            label: null,
            choices: [
              { label: null, items: [item('35 g de aveia', 'aveia', 35, 'g'), item('100 ml de leite', 'leite', 100, 'ml')] },
              { label: null, items: [item('150 g de banana', 'banana', 150, 'g')] },
            ],
          },
        ],
      },
      { name: 'LANCHE DA TARDE', time: null, notes: null, groups: [snack] },
    ]);
    expect(rejection(splitBreakfast, text)).toMatch(/aparecem juntos no texto, mas foram separados em escolhas diferentes/);
  });

  it('nome de dia que não está no texto NÃO recusa a dieta: o título criado pela IA é descartado, com aviso, e o dia fica só com o tipo', () => {
    const day = faithfulUserDiet();
    day.days[1].label = 'DIA DE FOLGA';
    const checked = checkDietFidelity(USER_EXAMPLE_DIET, day);
    expect(checked.days[1]).toMatchObject({ label: null, kind: 'rest', warnings: [DIET_WARNINGS.dayLabelDiscarded('DIA DE FOLGA')] });
    expect(checked.days[1].meals).toHaveLength(5);
    // O título que ESTÁ escrito continua como está.
    expect(checked.days[0]).toMatchObject({ label: 'DIA DE TREINO', warnings: [] });
  });

  it('caso real: a IA transforma o rodapé do PDF em título do dia ("BOCA DO NUTRIÇÃO") — o paciente nunca vê esse nome', () => {
    const organized = faithfulUserDiet();
    organized.days[0].label = 'BOCA DO NUTRIÇÃO';
    const checked = checkDietFidelity(`${USER_EXAMPLE_DIET}\nBOCADODENUTRIÇÃO`, organized);
    expect(checked.days.map((d) => [d.label, d.kind])).toEqual([
      [null, 'training'],
      ['DIA DE DESCANSO', 'rest'],
    ]);
    expect(checked.days[0].warnings).toEqual(['O título "BOCA DO NUTRIÇÃO" não está escrito no texto — foi criado pela IA e descartado. Confira o nome do dia.']);
    // O nome inventado só aparece no aviso para o profissional — nunca como título do dia.
    expect(JSON.stringify(checked.days.map(({ warnings: _warnings, ...day }) => day))).not.toMatch(/BOCA DO NUTRI/);
  });

  it('regressão: texto colado sem o título do 1º dia (só "DIA DE DESCANSO" escrito) e com rodapé do PDF é organizado, com avisos', () => {
    // Exatamente como o profissional colou: começa em "1. CAFÉ DA MANHÃ", bullets "•", linhas quebradas e o rodapé no meio.
    const pasted = USER_EXAMPLE_DIET.split('\nSUPLEMENTAÇÃO')[0]
      .replace(/^DIA DE TREINO\nUsar nos 5 dias de musculação na semana\. Escolher 1 opção em cada refeição ou bloco\.\n/, '')
      .replace(/\n\n/g, '\n')
      .replace(/\* /g, '• ')
      .replace(/\/ 120 g de polenta\./g, '/ 120 g de\npolenta.')
      .replace(/\/ 150 g de sobrecoxa sem pele\./g, '/ 150 g\nde sobrecoxa sem pele.')
      .replace('DIA DE DESCANSO', 'BOCADODENUTRIÇÃO\nDIA DE DESCANSO');
    expect(pasted.startsWith('1. CAFÉ DA MANHÃ — ESCOLHER 1 OPÇÃO')).toBe(true);
    const organized = { ...faithfulUserDiet(), supplements: [], guidelines: [] };

    const checked = checkDietFidelity(pasted, organized);
    // O 1º dia não tem título no texto: fica sem nome (as telas mostram "Dia de treino", pelo tipo).
    expect(checked.days.map((d) => [d.label, d.kind, d.meals.length])).toEqual([
      [null, 'training', 5],
      ['DIA DE DESCANSO', 'rest', 5],
    ]);
    expect(checked.days[0].warnings).toEqual([DIET_WARNINGS.dayLabelDiscarded('DIA DE TREINO'), DIET_WARNINGS.usageNotesDiscarded]);
    expect(checked.days[0].usageNotes).toBeNull();
    expect(checked.days[1].warnings).toEqual([]);
    expect(checked.warnings).toEqual([DIET_WARNINGS.uncovered('BOCADODENUTRIÇÃO')]);
  });

  it('rótulos inventados (bloco, opção) e orientação reescrita são recusados', () => {
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

  it('"opções completas" inventadas num texto sem escolha continuam recusadas, mesmo junto com outro bloco', () => {
    const organized = diet([
      {
        name: 'ALMOÇO',
        time: null,
        notes: null,
        groups: [{ kind: 'meal_options', label: null, choices: [{ label: null, items: [item('150 g arroz', 'Arroz', 150, 'g')] }] }, fixed([item('100 g feijão', 'Feijão', 100, 'g')])],
      },
    ]);
    expect(rejection(organized, text)).toMatch(/foi marcado como "escolha 1", mas o texto não indica escolha/);
  });

  it('opções completas + acréscimo na mesma refeição: as opções viram um bloco "escolher 1", com aviso', () => {
    const snackText = [
      'LANCHE DA TARDE — ESCOLHER 1 OPÇÃO',
      '• Opção 1: 150 g de queijo cottage + 30 g de castanhas.',
      '• Opção 2: 170 g de iogurte grego + 25 g de amendoim.',
      'Acréscimo (escolher 1): 150 g de banana / 35 g de aveia.',
    ].join('\n');
    const organized = diet([
      {
        name: 'LANCHE DA TARDE',
        time: null,
        notes: null,
        groups: [
          {
            kind: 'meal_options',
            label: null,
            choices: [
              { label: 'Opção 1', items: [item('150 g de queijo cottage', 'queijo cottage', 150, 'g'), item('30 g de castanhas', 'castanhas', 30, 'g')] },
              { label: 'Opção 2', items: [item('170 g de iogurte grego', 'iogurte grego', 170, 'g'), item('25 g de amendoim', 'amendoim', 25, 'g')] },
            ],
          },
          {
            kind: 'alternatives',
            label: 'Acréscimo',
            choices: [{ label: null, items: [item('150 g de banana', 'banana', 150, 'g')] }, { label: null, items: [item('35 g de aveia', 'aveia', 35, 'g')] }],
          },
        ],
      },
    ]);
    const checked = checkDietFidelity(snackText, organized);
    const snack = checked.days[0].meals[0];
    expect(snack.groups.map((g) => [g.kind, g.label, g.choices.map((c) => c.label)])).toEqual([
      ['alternatives', null, ['Opção 1', 'Opção 2']],
      ['alternatives', 'Acréscimo', [null, null]],
    ]);
    expect(snack.groups[0].choices[1].items.map((i) => i.sourceText)).toEqual(['170 g de iogurte grego', '25 g de amendoim']);
    expect(snack.warnings).toContain(DIET_WARNINGS.optionsWithOtherBlocks);

    // Item de uma opção trocado para outra continua recusado depois da conversão.
    const mixed = structuredClone(organized);
    const [first, second] = mixed.days[0].meals[0].groups[0].choices;
    first.items.push(second.items.pop()!);
    expect(rejection(mixed, snackText)).toMatch(/"25 g de amendoim" não faz parte da Opção 1/);
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

  it('detalhe entre parênteses antes da quantidade e outro trecho entre parênteses depois dela', () => {
    expect(core('Carne magra (patinho ou coxão mole) — 75 g', 'Carne magra', 75, 'g')).toBe('carne magra patinho ou coxao mole 75 g');
    const pasta = 'Macarrão cozido — 120 g (com molho de tomate caseiro 60 g)';
    expect(core(pasta, 'Macarrão cozido', 120, 'g')).toBe('macarrao cozido 120 g');
    expect(core(pasta, 'molho de tomate caseiro', 60, 'g')).toBe('molho de tomate caseiro 60 g');
    expect(core(pasta, 'Macarrão cozido', 60, 'g')).toBeNull();
  });

  it('parêntese com número ou alimento fora dele entre o alimento e a quantidade continua recusado', () => {
    expect(core('arroz (100 g) feijão 50 g', 'arroz', 50, 'g')).toBeNull();
    expect(core('arroz (cozido) feijão 50 g', 'arroz', 50, 'g')).toBeNull();
    expect(core('2 ovos (cozidos) 3 claras', 'ovos', 3)).toBeNull();
  });
});

describe('"escolha 1 opção:" com as opções uma por linha, sem "Opção N" escrito', () => {
  const lunch = (organized: AiOrganizedDiet) => organized.days[0].meals[1];

  it('é aceita inteira e sem aviso — numerada ("1.") ou não, como chega ao colar', () => {
    for (const text of [CHOOSE_ONE_LINES_DIET, CHOOSE_ONE_LINES_DIET_UNNUMBERED]) {
      const checked = checkDietFidelity(text, faithfulChooseOneLinesDiet());
      expect(checked.warnings).toEqual([]);
      expect(checked.days[0].meals.map((m) => m.name)).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO', 'LANCHE DA TARDE', 'LANCHE ANTES DO JANTAR', 'JANTAR', 'CEIA']);
      expect(checked.days[0].meals[0].groups[0].choices.map((c) => c.label)).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
      const protein = checked.days[0].meals[1].groups[0];
      expect(protein.label).toBe('Proteína');
      expect(protein.choices[2].items.map((i) => [i.rawFood, i.quantity, i.unit, i.notes])).toEqual([['Carne magra', 75, 'g', 'patinho ou coxão mole']]);
      const dinnerCarb = checked.days[0].meals[4].groups[1].choices[2].items;
      expect(dinnerCarb.map((i) => [i.rawFood, i.quantity])).toEqual([
        ['Macarrão cozido', 120],
        ['molho de tomate caseiro', 60],
      ]);
      expect(checked.supplements.map((s) => [s.name, s.quantity, s.quantityMax])).toEqual([
        ['Whey protein', 1, null],
        ['Creatina', 3, 5],
        ['Ômega-3', 2, 3],
      ]);
    }
  });

  it('a numeração criada pela IA só vale na ordem: "Opção 3" na 2ª escolha segue recusada', () => {
    const organized = faithfulChooseOneLinesDiet();
    organized.days[0].meals[0].groups[0].choices[1].label = 'Opção 3';
    expect(rejection(organized, CHOOSE_ONE_LINES_DIET_UNNUMBERED)).toMatch(/a opção "Opção 3" não está no texto/);
  });

  it('a numeração criada pela IA não libera separar itens ligados por "+" em opções diferentes', () => {
    // Ceia: "Danone natural (150 g)" sai da 1ª linha ("Fruta (100 g) + Danone natural (150 g) + …") e vai para a 2ª opção.
    const organized = faithfulChooseOneLinesDiet();
    const options = organized.days[0].meals[5].groups[0].choices;
    options[1].items.push(options[0].items.splice(1, 1)[0]);
    for (const text of [CHOOSE_ONE_LINES_DIET, CHOOSE_ONE_LINES_DIET_UNNUMBERED]) {
      expect(rejection(organized, text)).toMatch(/aparecem juntos no texto, mas foram separados/);
    }
  });

  it('IA que encurta o nome ("Arroz" em "Arroz cozido — 130 g"): aceito, com o nome escrito por inteiro', () => {
    const organized = faithfulChooseOneLinesDiet();
    for (const group of lunch(organized).groups) for (const choice of group.choices) for (const item of choice.items) if (item.sourceText.includes(' — ')) item.food = item.food.split(/[ (]/)[0];
    const checked = checkDietFidelity(CHOOSE_ONE_LINES_DIET_UNNUMBERED, organized);
    expect(checked.warnings).toEqual([]);
    expect(checked.days[0].meals[1].groups.slice(0, 3).map((g) => g.choices.map((c) => c.items[0].rawFood))).toEqual([
      ['Peito de frango', 'Peixe', 'Carne magra'],
      ['Arroz cozido', 'Batata-doce cozida', 'Aipim cozido', 'Batata inglesa cozida'],
      ['Feijão', 'Lentilha cozida'],
    ]);
  });

  it('"Nome — quantidade" não vale com dois alimentos no nome, número no nome ou outro alimento depois', () => {
    const core = (sourceText: string, food: string, quantity: number) => itemCore({ sourceText, food, quantity, unit: 'g', quantityMax: null, freeQuantity: false });
    expect(core('Arroz cozido — 130 g', 'Arroz', 130)).toBe('arroz cozido 130 g');
    expect(core('Arroz e feijão — 130 g', 'Arroz', 130)).toBeNull();
    expect(core('Arroz (100 g) cozido — 130 g', 'Arroz', 130)).toBeNull();
    expect(core('Arroz cozido — 130 g + feijão', 'Arroz', 130)).toBeNull();
    expect(core('Macarrão cozido — 120 g (com molho de tomate caseiro 60 g)', 'Macarrão', 60)).toBeNull();
  });

  it('quantidade trocada depois do parêntese é recusada (carne magra 75 g → 65 g)', () => {
    const organized = faithfulChooseOneLinesDiet();
    lunch(organized).groups[0].choices[2].items[0].quantity = 65;
    expect(rejection(organized, CHOOSE_ONE_LINES_DIET_UNNUMBERED)).toMatch(/quantidade 65 não está escrita/);
  });
});

describe('dieta real com opções em quase todas as refeições e "(patinho ou coxão mole)" dentro de um alimento', () => {
  const lunchOption3 = (organized: AiOrganizedDiet) => organized.days[0].meals[1].groups[0].choices[2].items;

  it('é aceita inteira e sem aviso: quatro refeições com 3 opções e o lanche antes do jantar sem opções', () => {
    const checked = checkDietFidelity(OPTIONS_EXAMPLE_DIET, faithfulOptionsDiet());
    const threeOptions = [['meal_options', ['Opção 1', 'Opção 2', 'Opção 3']]];
    expect(checked.warnings).toEqual([]);
    expect(checked.days).toHaveLength(1);
    expect(checked.days[0].meals.map((m) => [m.name, m.groups.map((g) => [g.kind, g.choices.map((c) => c.label)])])).toEqual([
      ['CAFÉ DA MANHÃ', threeOptions],
      ['ALMOÇO', threeOptions],
      ['LANCHE DA TARDE', threeOptions],
      ['LANCHE ANTES DO JANTAR', [['fixed', [null]]]],
      ['JANTAR', threeOptions],
    ]);
  });

  it('opções coladas numa linha só ("• Opção 1: … • Opção 2: …", como alguns PDFs copiam) contam como linhas separadas', () => {
    const glued = OPTIONS_EXAMPLE_DIET.replace(/\n(Opção [23]:)/g, ' • $1').replace(/^(Opção 1:)/gm, '• $1');
    expect(glued).toContain('5 g de psyllium. • Opção 2: Omelete');
    expect(checkDietFidelity(glued, faithfulOptionsDiet()).warnings).toEqual([]);

    // Opções misturadas continuam recusadas com o texto colado.
    const mixed = faithfulOptionsDiet();
    const lunch = mixed.days[0].meals[1].groups[0].choices;
    lunch[0].items.push(lunch[1].items.pop()!);
    expect(rejection(mixed, glued)).toMatch(/não faz parte da Opção 1/);
  });

  it('todo alimento, quantidade, faixa, unidade, "à vontade" e observação sai exatamente como escrito', () => {
    const checked = checkDietFidelity(OPTIONS_EXAMPLE_DIET, faithfulOptionsDiet());
    const written = allItems(faithfulOptionsDiet().days).map((i) => [i.sourceText, i.food, i.quantity, i.quantityMax, i.unit, i.freeQuantity, i.notes]);
    const kept = allItems(checked.days).map((i) => [i.sourceText, i.rawFood, i.quantity, i.quantityMax, i.unitText, i.freeQuantity, i.notes]);
    expect(kept).toEqual(written);
    expect(kept).toHaveLength(59);
    expect(kept).toContainEqual(['3 a 5 g de creatina', 'creatina', 3, 5, 'g', false, null]);
    expect(kept).toContainEqual(['salada à vontade', 'salada', null, null, null, true, null]);
    expect(kept).toContainEqual(['60 ml de leite vegetal', 'leite vegetal', 60, null, 'ml', false, null]);
  });

  it('"patinho ou coxão mole" fica como detalhe de UM item (carne magra), junto dos outros alimentos da Opção 3', () => {
    const checked = checkDietFidelity(OPTIONS_EXAMPLE_DIET, faithfulOptionsDiet());
    const option3 = checked.days[0].meals[1].groups[0].choices[2].items;
    expect(option3.map((i) => i.rawFood)).toEqual(['carne magra', 'arroz cozido', 'lentilha cozida', 'salada', 'azeite']);
    expect(option3[0]).toMatchObject({ sourceText: '95 g de carne magra (patinho ou coxão mole)', quantity: 95, unit: 'g', notes: 'patinho ou coxão mole' });
  });

  it('patinho e coxão mole como dois alimentos obrigatórios são recusados', () => {
    const organized = faithfulOptionsDiet();
    lunchOption3(organized).splice(0, 1, item('95 g de carne magra', 'carne magra', 95, 'g'), item('patinho', 'patinho', null, null), item('coxão mole', 'coxão mole', null, null));
    expect(rejection(organized, OPTIONS_EXAMPLE_DIET)).toMatch(/"patinho" e "coxao mole" são alternativas no texto/);
  });

  it('as demais conferências seguem valendo nessa linha: quantidade trocada e item de outra opção são recusados', () => {
    const changed = faithfulOptionsDiet();
    lunchOption3(changed)[0] = { ...leanMeat(), quantity: 85 };
    expect(rejection(changed, OPTIONS_EXAMPLE_DIET)).toMatch(/quantidade 85 não está escrita/);

    const mixed = faithfulOptionsDiet();
    lunchOption3(mixed)[4] = item('9 g de azeite', 'azeite', 9, 'g');
    expect(rejection(mixed, OPTIONS_EXAMPLE_DIET)).toMatch(/"9 g de azeite" não faz parte da Opção 3/);
  });
});

describe('"ou" e "/" entre parênteses: detalhe de um alimento × alternativas de verdade', () => {
  const banana = () => item('1 banana', 'banana', 1, null);
  const apple = () => item('1 maçã', 'maçã', 1, null);
  const asChoices = (name: string, choices: AiDietItem[][]) =>
    diet([meal(name, [], { groups: [{ kind: 'alternatives', label: null, choices: choices.map((items) => ({ label: null, items })) }] })]);
  const QUANTIFIED_INSIDE = [
    'LANCHE\n1 fruta (1 banana ou 1 maçã)',
    'LANCHE\nFruta (1 banana / 1 maçã)',
    'LANCHE\n1 banana (ou 1 maçã)',
    // Parêntese que não fecha não esconde separador nenhum.
    'LANCHE\nFruta (1 banana / 1 maçã',
  ];

  it.each(QUANTIFIED_INSIDE)('alternativas escritas dentro do parêntese não podem virar itens fixos: %j', (text) => {
    expect(rejection(diet([meal('LANCHE', [banana(), apple()])]), text)).toMatch(/"1 banana" e "1 maca" são alternativas no texto/);
  });

  it.each(QUANTIFIED_INSIDE)('e são aceitas como "escolha 1": %j', (text) => {
    expect(() => checkDietFidelity(text, asChoices('LANCHE', [[banana()], [apple()]]))).not.toThrow();
  });

  it.each([
    'LANCHE\n2 fatias de pão integral\nou 1 tapioca',
    'LANCHE\n2 fatias de pão integral\nOu 1 tapioca',
    'LANCHE\n2 fatias de pão integral ou\n1 tapioca',
  ])('linha que começa ou termina com "ou" indica escolha: %j', (text) => {
    const organized = asChoices('LANCHE', [[item('2 fatias de pão integral', 'pão integral', 2, 'fatias')], [item('1 tapioca', 'tapioca', 1, null)]]);
    expect(checkDietFidelity(text, organized).warnings).toEqual([]);
  });

  it('detalhe entre parênteses não separa o alimento do resto da linha, mas "ou" fora dele continua separando', () => {
    const text = 'ALMOÇO\n150 g de frango (grelhado ou assado) + 90 g de arroz ou 120 g de batata';
    const chicken = () => item('150 g de frango (grelhado ou assado)', 'frango', 150, 'g');
    const rice = () => item('90 g de arroz', 'arroz', 90, 'g');
    const potato = () => item('120 g de batata', 'batata', 120, 'g');
    expect(rejection(diet([meal('ALMOÇO', [chicken(), rice(), potato()])]), text)).toMatch(/"90 g de arroz" e "120 g de batata" são alternativas no texto/);
    expect(() => checkDietFidelity(text, asChoices('ALMOÇO', [[chicken(), rice()], [potato()]]))).not.toThrow();
  });
});

describe('dia sem nenhuma refeição devolvido pela IA', () => {
  const emptyDay = (label: string | null) => ({ label, kind: 'other' as const, usageNotes: null, meals: [] });

  it('sai da proposta (o servidor não salva dia vazio) e vira aviso para o profissional conferir', () => {
    const organized = faithfulOptionsDiet();
    organized.days.push(emptyDay(null));
    const checked = checkDietFidelity(OPTIONS_EXAMPLE_DIET, organized);
    expect(checked.days).toHaveLength(1);
    expect(checked.days[0].meals).toHaveLength(5);
    expect(checked.warnings).toEqual([DIET_WARNINGS.dayWithoutMeals(null)]);
  });

  it('o aviso cita o título do dia; as refeições dos outros dias ficam como estavam', () => {
    const organized = faithfulUserDiet();
    organized.days[1].meals = [];
    const checked = checkDietFidelity(USER_EXAMPLE_DIET, organized);
    expect(checked.days.map((d) => [d.label, d.meals.length])).toEqual([['DIA DE TREINO', 5]]);
    expect(checked.warnings).toContain('O dia "DIA DE DESCANSO" veio sem nenhuma refeição e não foi incluído — confira o texto.');
    // O que estava escrito para esse dia não some: aparece como trecho não organizado.
    expect(checked.warnings.some((w) => w.startsWith('Trecho não organizado') && w.includes('35 g de muçarela'))).toBe(true);
  });

  it('só dias vazios: continua recusado', () => {
    expect(rejection({ days: [emptyDay(null)], supplements: [], guidelines: [], warnings: [] }, OPTIONS_EXAMPLE_DIET)).toMatch(/Nenhuma refeição foi organizada/);
  });
});

describe('texto colado com a linha quebrada no meio da frase (cópia de PDF/Word)', () => {
  const WIDTHS = Array.from({ length: 141 }, (_, i) => 40 + i);
  const optionsDiet = (change: (organized: AiOrganizedDiet) => void = () => undefined) => {
    const organized = faithfulOptionsDiet();
    change(organized);
    return organized;
  };
  const userDiet = (change: (organized: AiOrganizedDiet) => void = () => undefined) => {
    const organized = faithfulUserDiet();
    change(organized);
    return organized;
  };
  const widthsWhereAccepted = (text: string, organized: AiOrganizedDiet) =>
    WIDTHS.filter((width) => {
      try {
        checkDietFidelity(hardWrap(text, width), organized);
        return true;
      } catch {
        return false;
      }
    });

  it('regressão: a dieta com opções quebrada em ~115 colunas era recusada por "opções misturadas"', () => {
    const pasted = hardWrap(OPTIONS_EXAMPLE_DIET, 115);
    // O alimento fica metade em cada linha; a continuação pertence à mesma opção.
    expect(pasted).toContain('+ salada à\nvontade + 8 g de azeite.');
    expect(pasted).toContain('por cima + 3 a 5 g\nde creatina.');
    expect(pasted).toContain('+ 8 g de semente de\nabóbora + 3 a 5 g de creatina.');
    const checked = checkDietFidelity(pasted, faithfulOptionsDiet());
    expect(checked.warnings).toEqual([]);
    expect(checked.days[0].meals.map((m) => m.groups[0].choices.map((c) => c.items.length))).toEqual([[4, 5, 4], [5, 5, 5], [4, 5, 5], [3], [5, 4, 5]]);
  });

  it('as duas dietas reais são aceitas com a quebra em qualquer largura', () => {
    for (const width of WIDTHS) {
      expect(() => checkDietFidelity(hardWrap(OPTIONS_EXAMPLE_DIET, width), faithfulOptionsDiet())).not.toThrow();
      expect(() => checkDietFidelity(hardWrap(USER_EXAMPLE_DIET, width), faithfulUserDiet())).not.toThrow();
    }
  });

  it.each([
    ['item da Opção 1 dentro da Opção 3', OPTIONS_EXAMPLE_DIET, optionsDiet((d) => (d.days[0].meals[1].groups[0].choices[2].items[4] = item('9 g de azeite', 'azeite', 9, 'g')))],
    ['item da Opção 3 dentro da Opção 1', OPTIONS_EXAMPLE_DIET, optionsDiet((d) => d.days[0].meals[1].groups[0].choices[0].items.push(item('60 g de lentilha cozida', 'lentilha cozida', 60, 'g')))],
    [
      'patinho e coxão mole como dois alimentos',
      OPTIONS_EXAMPLE_DIET,
      optionsDiet((d) => d.days[0].meals[1].groups[0].choices[2].items.splice(0, 1, item('95 g de carne magra', 'carne magra', 95, 'g'), item('patinho', 'patinho', null, null), item('coxão mole', 'coxão mole', null, null))),
    ],
    ['quantidade trocada', OPTIONS_EXAMPLE_DIET, optionsDiet((d) => (d.days[0].meals[1].groups[0].choices[2].items[0].quantity = 85))],
    [
      'alternativas ("/") viradas itens fixos',
      USER_EXAMPLE_DIET,
      userDiet((d) => {
        const group = d.days[0].meals[1].groups[0];
        group.kind = 'fixed';
        group.label = null;
        group.choices = [{ label: null, items: group.choices.flatMap((c) => c.items) }];
      }),
    ],
    [
      'itens ligados por "+" separados em escolhas diferentes',
      USER_EXAMPLE_DIET,
      userDiet((d) => {
        const group = d.days[1].meals[1].groups[0];
        const [chicken, oil] = group.choices[0].items;
        group.choices.splice(0, 1, { label: null, items: [chicken] }, { label: null, items: [oil] });
      }),
    ],
  ])('a quebra de linha não afrouxa nada: %s segue recusado em qualquer largura', (_name, text, organized) => {
    expect(widthsWhereAccepted(text, organized)).toEqual([]);
  });

  it('alimentos escritos um por linha não são emendados: lista fixa e bloco "escolher 1" continuam valendo', () => {
    expect(checkDietFidelity(TEXT, faithful()).warnings).toEqual([]);
    const block = 'ALMOÇO\nCarboidrato (escolher 1):\n65 g de arroz\n160 g de batata';
    const rice = () => item('65 g de arroz', 'arroz', 65, 'g');
    const potato = () => item('160 g de batata', 'batata', 160, 'g');
    const asBlock = diet([meal('ALMOÇO', [], { groups: [{ kind: 'alternatives', label: 'Carboidrato', choices: [{ label: null, items: [rice()] }, { label: null, items: [potato()] }] }] })]);
    expect(() => checkDietFidelity(block, asBlock)).not.toThrow();
  });

  it('linha que continua a anterior por "ou" é lida junto: as alternativas não podem virar itens fixos', () => {
    const bread = () => item('2 fatias de pão integral', 'pão integral', 2, 'fatias');
    const tapioca = () => item('1 tapioca', 'tapioca', 1, null);
    for (const text of ['LANCHE\n2 fatias de pão integral\nou 1 tapioca', 'LANCHE\n2 fatias de pão integral ou\n1 tapioca']) {
      expect(rejection(diet([meal('LANCHE', [bread(), tapioca()])]), text)).toMatch(/"2 fatias de pao integral" e "1 tapioca" são alternativas no texto/);
    }
  });
});

describe('quantidade no meio do nome do alimento ("Omelete de 1 ovo") e faixa de quantidade', () => {
  const core = (sourceText: string, food: string, quantity: number | null, unit: string | null = null) =>
    itemCore({ sourceText, food, quantity, unit, quantityMax: null, freeQuantity: false });
  const breakfastOption2 = (first: AiDietItem) => {
    const organized = faithfulOptionsDiet();
    organized.days[0].meals[0].groups[0].choices[1].items[0] = first;
    return organized;
  };
  const single = (text: string, only: AiDietItem) => ({ text: `LANCHE\n${text}`, organized: diet([meal('LANCHE', [only])]) });

  it.each([
    ['ovo', '1 ovo'],
    ['Omelete de ovo', 'omelete de 1 ovo'],
    ['Omelete de 1 ovo', 'omelete de 1 ovo'],
  ])('"Omelete de 1 ovo" com o alimento "%s" e quantidade 1 é aceito', (food, expectedCore) => {
    expect(core('Omelete de 1 ovo', food, 1)).toBe(expectedCore);
    const checked = checkDietFidelity(OPTIONS_EXAMPLE_DIET, breakfastOption2(item('Omelete de 1 ovo', food, 1, null)));
    const kept = checked.days[0].meals[0].groups[0].choices[1].items[0];
    expect(kept).toMatchObject({ sourceText: 'Omelete de 1 ovo', rawFood: food, quantity: 1, unit: 'unit' });
    // Quantidade no meio do nome sempre vai para a revisão do profissional.
    expect(kept.warnings.includes(DIET_WARNINGS.quantityInsideName)).toBe(food !== 'ovo');
    expect(checked.warnings).toEqual([]);
  });

  it('a quantidade do ingrediente não vira quantidade da preparação: "Omelete" com quantidade 1 segue recusado', () => {
    expect(core('Omelete de 1 ovo', 'Omelete', 1)).toBeNull();
    expect(rejection(breakfastOption2(item('Omelete de 1 ovo', 'Omelete', 1, null)), OPTIONS_EXAMPLE_DIET)).toMatch(/quantidade 1 não está junto de "Omelete"/);
  });

  it('juntar dois alimentos num item só continua recusado ("Omelete de 1 ovo + 3 claras" como um alimento)', () => {
    const organized = faithfulOptionsDiet();
    organized.days[0].meals[0].groups[0].choices[1].items.splice(0, 2, item('Omelete de 1 ovo + 3 claras', 'Omelete de ovo e claras', 1, null));
    expect(rejection(organized, OPTIONS_EXAMPLE_DIET)).toMatch(/quantidade 1 não está junto de "Omelete de ovo e claras"/);
  });

  it('outras preparações "de N ingrediente" são aceitas com o mesmo aviso', () => {
    const juice = single('Suco de 2 laranjas', item('Suco de 2 laranjas', 'suco de laranja', 2, null));
    expect(checkDietFidelity(juice.text, juice.organized).days[0].meals[0].groups[0].choices[0].items[0]).toMatchObject({ quantity: 2, warnings: expect.arrayContaining([DIET_WARNINGS.quantityInsideName]) });
    const shake = single('Vitamina de 200 ml de leite', item('Vitamina de 200 ml de leite', 'vitamina de leite', 200, 'ml'));
    expect(checkDietFidelity(shake.text, shake.organized).days[0].meals[0].groups[0].choices[0].items[0]).toMatchObject({ quantity: 200, unit: 'ml', warnings: [DIET_WARNINGS.quantityInsideName] });
  });

  it('não vale para quantidade de OUTRO alimento, nem quando já há quantidade antes do nome', () => {
    // "com" liga dois alimentos; sem "de" antes do número, ele é do alimento anterior.
    expect(core('pão com 2 ovos', 'pão com ovos', 2)).toBeNull();
    expect(core('pão com 2 ovos', 'pão', 2)).toBeNull();
    expect(core('arroz 150 g + feijão', 'arroz feijão', 150, 'g')).toBeNull();
    expect(core('2 omeletes de 1 ovo', 'omelete de ovo', 1)).toBeNull();
    const bread = single('pão com 2 ovos', item('pão com 2 ovos', 'pão com ovos', 2, null));
    expect(rejection(bread.organized, bread.text)).toMatch(/quantidade 2 não está junto de "pão com ovos"/);
  });

  it('faixa "3 a 5 g": só o mínimo ou só o máximo altera a prescrição e é recusado', () => {
    expect(core('3 a 5 g de creatina', 'creatina', 3, 'g')).toBeNull();
    expect(core('3 a 5 g de creatina', 'creatina', 5, 'g')).toBeNull();
    expect(itemCore({ sourceText: '3 a 5 g de creatina', food: 'creatina', quantity: 3, quantityMax: 5, unit: 'g', freeQuantity: false })).toBe('3 a 5 g de creatina');
    for (const quantity of [3, 5]) {
      const organized = faithfulOptionsDiet();
      organized.days[0].meals[2].groups[0].choices[0].items[3] = item('3 a 5 g de creatina', 'creatina', quantity, 'g');
      expect(rejection(organized, OPTIONS_EXAMPLE_DIET)).toMatch(new RegExp(`quantidade ${quantity} não está junto de "creatina"`));
    }
  });

  it('"1 e 1/2" é 1,5 — nunca 0,5; e o "e" entre dois alimentos não é faixa', () => {
    expect(core('1 e 1/2 xícara de arroz', 'arroz', 1.5, 'xícara')).toBe('1 e 1/2 xicara de arroz');
    expect(core('1 e 1/2 xícara de arroz', 'arroz', 0.5, 'xícara')).toBeNull();
    expect(core('2 ovos e 3 claras', 'clara', 3)).toBe('3 claras');
    expect(core('100 g de arroz e 50 g de feijão', 'feijão', 50, 'g')).toBe('50 g de feijao');
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
