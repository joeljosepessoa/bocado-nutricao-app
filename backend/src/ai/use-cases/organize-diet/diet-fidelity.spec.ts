import { AiOutputValidationError } from '../../ai-errors';
import { checkDietFidelity, DIET_WARNINGS, mapUnit, normalizeDietText, parseMealTime, quantitySpellings } from './diet-fidelity';
import type { AiDietItem, AiMeal, AiOrganizedDiet } from './organized-diet.schema';

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

const item = (sourceText: string, food: string, quantity: number | null, unit: string | null, notes: string | null = null): AiDietItem => ({
  sourceText,
  food,
  quantity,
  unit,
  notes,
});
const meal = (name: string | null, items: AiDietItem[], extra: Partial<AiMeal> = {}): AiMeal => ({ name, time: null, notes: null, items, ...extra });

const faithful = (): AiOrganizedDiet => ({
  meals: [
    meal('CAFÉ DA MANHÃ', [
      item('2 fatias de pão integral', 'Pão integral', 2, 'fatias'),
      item('4 ovos inteiros', 'Ovo inteiro', 4, null),
      item('4 claras', 'Clara', 4, null),
      item('150 g de fruta', 'Fruta', 150, 'g'),
    ]),
    meal('ALMOÇO', [
      item('150 g arroz', 'Arroz', 150, 'g'),
      item('100 g feijão', 'Feijão', 100, 'g'),
      item('150 g frango', 'Frango', 150, 'g'),
      item('salada', 'Salada', null, null),
    ]),
  ],
  warnings: [],
});

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
    expect(checked.meals.map((m) => m.name)).toEqual(['CAFÉ DA MANHÃ', 'ALMOÇO']);
    const breakfast = checked.meals[0].items;
    expect(breakfast.map((i) => [i.rawFood, i.quantity, i.unit])).toEqual([
      ['Pão integral', 2, 'slice'],
      ['Ovo inteiro', 4, 'unit'],
      ['Clara', 4, 'unit'],
      ['Fruta', 150, 'g'],
    ]);
    // Unidade não escrita é sinalizada para revisão; quantidade ausente também.
    expect(breakfast[1].warnings).toContain(DIET_WARNINGS.unitAssumed);
    expect(checked.meals[1].items[3].warnings).toContain(DIET_WARNINGS.quantityMissing);
    expect(checked.warnings).toEqual([]);
  });

  it('quantidade alterada (150 g → 200 g, 4 ovos → 2) é recusada', () => {
    const changed = faithful();
    changed.meals[0].items[3] = item('150 g de fruta', 'Fruta', 200, 'g');
    expect(rejection(changed)).toMatch(/quantidade 200 não está escrita/);

    const fewer = faithful();
    fewer.meals[0].items[1] = item('4 ovos inteiros', 'Ovo inteiro', 2, null);
    expect(rejection(fewer)).toMatch(/quantidade 2 não está escrita/);
  });

  it('alimento trocado (fruta → banana) ou inventado é recusado', () => {
    const swapped = faithful();
    swapped.meals[0].items[3] = item('150 g de fruta', 'Banana', 150, 'g');
    expect(rejection(swapped)).toMatch(/alimento "Banana" não corresponde/);

    const invented = faithful();
    invented.meals[1].items.push(item('1 colher de azeite', 'Azeite', 1, 'colher de sopa'));
    expect(rejection(invented)).toMatch(/trecho "1 colher de azeite" não está no texto/);
  });

  it('refeição acrescentada (sem origem no texto) é recusada', () => {
    const extraMeal = faithful();
    extraMeal.meals.push(meal('CEIA', [item('salada', 'Salada', null, null)]));
    expect(rejection(extraMeal)).toMatch(/refeição "CEIA" não está no texto/);
  });

  it('item repetido além do que está escrito é recusado', () => {
    const duplicated = faithful();
    duplicated.meals[1].items.push(item('150 g frango', 'Frango', 150, 'g'));
    expect(rejection(duplicated)).toMatch(/usado mais vezes do que aparece/);
  });

  it('unidade alterada (g → kg) é recusada; kg escrito vira aviso de unidade não suportada', () => {
    const changed = faithful();
    changed.meals[1].items[0] = item('150 g arroz', 'Arroz', 150, 'kg');
    expect(rejection(changed)).toMatch(/unidade "kg" não está escrita/);

    const kg = checkDietFidelity('ALMOÇO\n1 kg de batata', { meals: [meal('ALMOÇO', [item('1 kg de batata', 'Batata', 1, 'kg')])], warnings: [] });
    expect(kg.meals[0].items[0].unit).toBeNull();
    expect(kg.meals[0].items[0].warnings).toContain(DIET_WARNINGS.unitUnsupported('kg'));
  });

  it('alimento omitido pela IA não some: vira aviso "Trecho não organizado"', () => {
    const missing = faithful();
    missing.meals[1].items.splice(1, 1); // tira o feijão
    const checked = checkDietFidelity(TEXT, missing);
    expect(checked.warnings).toEqual([DIET_WARNINGS.uncovered('100 g feijão')]);
  });

  it('dieta em linha única com vírgulas e "e" é coberta sem avisos', () => {
    const text = 'Café da manhã: 2 fatias de pão integral, 4 ovos inteiros, 4 claras e 150g de fruta';
    const checked = checkDietFidelity(text, {
      meals: [
        meal('Café da manhã', [
          item('2 fatias de pão integral', 'Pão integral', 2, 'fatias'),
          item('4 ovos inteiros', 'Ovo inteiro', 4, null),
          item('4 claras', 'Clara', 4, null),
          item('150g de fruta', 'Fruta', 150, 'g'),
        ]),
      ],
      warnings: [],
    });
    expect(checked.warnings).toEqual([]);
    expect(checked.meals[0].items.map((i) => i.quantity)).toEqual([2, 4, 4, 150]);
  });

  it('horário só se escrito; observação reescrita é descartada com aviso', () => {
    const text = 'ALMOÇO 12h30\n150 g arroz (sem sal)';
    const checked = checkDietFidelity(text, {
      meals: [meal('ALMOÇO', [item('150 g arroz', 'Arroz', 150, 'g', 'pouco sal')], { time: '12h30' })],
      warnings: [],
    });
    expect(checked.meals[0].time).toBe('12:30');
    expect(checked.meals[0].items[0].notes).toBeNull();
    expect(checked.meals[0].items[0].warnings).toContain(DIET_WARNINGS.noteDiscarded);

    expect(rejection({ meals: [meal('ALMOÇO', [item('150 g arroz', 'Arroz', 150, 'g')], { time: '13h' })], warnings: [] }, text)).toMatch(
      /horário "13h" não está no texto/,
    );
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
