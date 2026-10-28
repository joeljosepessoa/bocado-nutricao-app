import { normalizeFoodName } from './food-name-matching';
import { nameMatches, searchRank, searchWords } from './food-library';
import { ownNutrientSections, tacoNutrientSections } from './food-nutrients';

describe('busca da tela Alimentos', () => {
  const matches = (name: string, term: string) => nameMatches(normalizeFoodName(name), searchWords(term));

  it('acha palavra por palavra, sem acento e com plural', () => {
    expect(matches('Frango, peito, sem pele, grelhado', 'frango grelhado')).toBe(true);
    expect(matches('Feijão, carioca, cozido', 'feijao cozido')).toBe(true);
    expect(matches('Ovo, de galinha, inteiro, cozido/10minutos', 'ovos de galinha')).toBe(true);
    expect(matches('Frango, peito, sem pele, grelhado', 'frango frito')).toBe(false);
  });

  it('nome que começa com a palavra vem antes', () => {
    const words = searchWords('banana');
    const names = ['Doce, de banana, caseiro', 'Banana, prata, crua', 'Banana, da terra, crua'];
    const sorted = [...names].sort((a, b) => searchRank(normalizeFoodName(a), words) - searchRank(normalizeFoodName(b), words));
    expect(sorted[0]).toBe('Banana, prata, crua');
    expect(sorted[2]).toBe('Doce, de banana, caseiro');
  });
});

describe('ficha de nutrientes', () => {
  it('organiza a TACO em seções e mantém o marcador (nunca 0)', () => {
    const sections = tacoNutrientSections({
      nutrientes: {
        energia_kcal: { valor: 124, situacao: 'valor' },
        proteina: { valor: 2.6, situacao: 'valor' },
        niacina: { valor: null, situacao: 'traco' },
        retinol: { valor: null, situacao: 'nao_aplicavel' },
        calcio: { valor: 5.2, situacao: 'valor' },
      },
      acidosGraxos: { saturados: { valor: null, situacao: 'nao_analisado' } },
      aminoacidos: null,
    });
    expect(sections.map((s) => s.title)).toEqual(['Composição', 'Minerais', 'Vitaminas']);
    const vitamins = sections.find((s) => s.title === 'Vitaminas')!;
    expect(vitamins.rows).toContainEqual({ key: 'niacina', label: 'Niacina (B3)', unit: 'mg', value: null, status: 'traco' });
    expect(sections[0].rows[0]).toEqual({ key: 'energia_kcal', label: 'Energia', unit: 'kcal', value: 124, status: 'valor' });
  });

  it('alimento próprio mostra só o que foi informado', () => {
    const [composition] = ownNutrientSections({ kcalPer100: 50, proteinGPer100: 1, carbGPer100: 12, fatGPer100: 0, fiberGPer100: null, sodiumMgPer100: null });
    expect(composition.rows.find((r) => r.key === 'lipideos')).toMatchObject({ value: 0, status: 'valor' });
    expect(composition.rows.find((r) => r.key === 'fibra_alimentar')).toMatchObject({ value: null, status: 'nao_analisado' });
  });
});
