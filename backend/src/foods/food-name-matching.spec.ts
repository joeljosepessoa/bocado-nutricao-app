import { buildFoodAliasIndex, buildFoodCatalogIndex, buildLearnedLinkIndex, matchFoodName, SavedFoodLinkRow } from './food-name-matching';

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

describe('matchFoodName — o que o profissional já ligou nas dietas salvas', () => {
  const refs = [
    { id: 't3', name: 'Arroz, tipo 1, cozido' },
    { id: 't4', name: 'Arroz integral, cozido' },
    { id: 't90', name: 'Ovo de galinha inteiro, cozido' },
    { id: 't182', name: 'Banana prata' },
    { id: 't183', name: 'Maçã fuji' },
    { id: 't410', name: 'Frango, peito, sem pele, grelhado' },
    { id: 't411', name: 'Frango, peito, com pele, assado' },
  ];
  const taco = buildFoodCatalogIndex(refs);
  const visible = new Map(refs.map((r) => [r.id, r]));
  const row = (writtenName: string, foodId: string | null, dietVersionId = 'v1'): SavedFoodLinkRow => ({ writtenName, foodId, dietVersionId });

  it('nome já ligado liga sozinho (acento, caixa e plural não importam)', () => {
    const learned = buildLearnedLinkIndex([row('arroz', 't3'), row('Ovos inteiros', 't90')], visible);
    expect(matchFoodName('Arroz', taco, undefined, learned)).toEqual({ status: 'matched', food: refs[0], candidates: [] });
    expect(matchFoodName('ovo inteiro', taco, undefined, learned).food?.id).toBe('t90');
  });

  it('vale a escolha mais recente: dieta nova com outro alimento substitui a antiga', () => {
    const learned = buildLearnedLinkIndex([row('arroz', 't4', 'v-nova'), row('arroz', 't3', 'v-antiga')], visible);
    expect(matchFoodName('arroz', taco, undefined, learned).food?.id).toBe('t4');
  });

  it('nome ligado a alimentos diferentes na mesma dieta ("fruta") não é aprendido', () => {
    const learned = buildLearnedLinkIndex([row('fruta', 't182'), row('fruta', 't183'), row('fruta', 't182', 'v-antiga')], visible);
    expect(matchFoodName('fruta', taco, undefined, learned).status).toBe('not_found');
  });

  it('na dieta mais recente sem ligação, nada é aprendido; ocorrência sem ligação ao lado de uma ligada não atrapalha', () => {
    expect(buildLearnedLinkIndex([row('arroz', null, 'v-nova'), row('arroz', 't3', 'v-antiga')], visible).size).toBe(0);
    expect(buildLearnedLinkIndex([row('arroz', null), row('arroz', 't3')], visible).get('arroz')?.id).toBe('t3');
  });

  it('"sem pele" nunca vira "com pele"', () => {
    const learned = buildLearnedLinkIndex([row('frango sem pele', 't410')], visible);
    expect(matchFoodName('frango com pele', taco, undefined, learned).food).toBeNull();
  });

  it('a escolha do profissional vale mais que o apelido da lista do Bocado', () => {
    const aliases = buildFoodAliasIndex([{ alias: 'arroz', food: refs[0] }]);
    const learned = buildLearnedLinkIndex([row('arroz', 't4')], visible);
    expect(matchFoodName('arroz', taco, aliases, learned).food?.id).toBe('t4');
  });

  it('alimento que não está mais visível é ignorado', () => {
    expect(buildLearnedLinkIndex([row('arroz', 'apagado')], visible).size).toBe(0);
  });
});
