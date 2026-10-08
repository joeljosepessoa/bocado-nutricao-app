import { buildFoodAliasIndex, buildFoodCatalogIndex, matchFoodName } from './food-name-matching';

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

describe('matchFoodName — apelidos aprovados pelo nutricionista', () => {
  const taco = buildFoodCatalogIndex([
    { id: 't410', name: 'Frango, peito, sem pele, grelhado' },
    { id: 't3', name: 'Arroz, tipo 1, cozido' },
    { id: 'p1', name: 'Peito de frango' },
  ]);
  const aliases = buildFoodAliasIndex([
    { alias: 'peito de frango', food: { id: 't410', name: 'Frango, peito, sem pele, grelhado' } },
    { alias: 'arroz branco', food: { id: 't3', name: 'Arroz, tipo 1, cozido' } },
  ]);

  it('nome escrito diferente da TACO liga pelo apelido (acento, caixa e plural do texto não importam)', () => {
    expect(matchFoodName('Arroz Branco', taco, aliases)).toEqual({ status: 'matched', food: { id: 't3', name: 'Arroz, tipo 1, cozido' }, candidates: [] });
  });

  it('nome igual a um alimento do catálogo continua tendo prioridade sobre o apelido', () => {
    expect(matchFoodName('Peito de frango', taco, aliases).food?.id).toBe('p1');
  });

  it('sem apelidos, o comportamento antigo não muda', () => {
    expect(matchFoodName('Arroz branco', taco).status).toBe('ambiguous');
  });
});
