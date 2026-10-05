import { buildFoodCatalogIndex, matchFoodName } from './food-name-matching';

const catalog = buildFoodCatalogIndex([
  { id: 'f1', name: 'Arroz, tipo 1, cozido' },
  { id: 'f2', name: 'Arroz integral, cozido' },
  { id: 'f3', name: 'Ovo de galinha inteiro, cozido' },
  { id: 'f4', name: 'Banana prata' },
  { id: 'f5', name: 'Pão integral' },
]);

describe('matchFoodName — nunca inventa correspondência', () => {
  it('nome igual (ignorando acento/caixa) associa direto', () => {
    expect(matchFoodName('pao integral', catalog)).toMatchObject({ status: 'matched', food: { id: 'f5' } });
  });

  it('nome parecido só vira sugestão (o profissional escolhe)', () => {
    const arroz = matchFoodName('Arroz', catalog);
    expect(arroz.status).toBe('ambiguous');
    expect(arroz.food).toBeNull();
    expect(arroz.candidates.map((c) => c.id)).toEqual(expect.arrayContaining(['f1', 'f2']));

    expect(matchFoodName('Ovos inteiros', catalog).candidates.map((c) => c.id)).toEqual(['f3']);
  });

  it('"fruta" não vira "banana": sem correspondência, sem sugestão inventada', () => {
    expect(matchFoodName('Fruta', catalog)).toEqual({ status: 'not_found', food: null, candidates: [] });
  });
});
