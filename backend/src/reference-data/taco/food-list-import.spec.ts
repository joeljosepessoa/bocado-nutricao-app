import { readFileSync } from 'fs';
import { join } from 'path';
import { FoodListChoiceFile, importFoodList, planFoodList, tacoKey } from './food-list-import';
import { InMemoryFoodListStore } from './food-list-stores';

const FILE = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'lista-bocado-escolhas.json'), 'utf8')) as FoodListChoiceFile;

/** Catálogo fictício: cada nº da TACO usado no arquivo vira um id "food-<nº>". */
function catalogFor(file: FoodListChoiceFile): Map<string, string> {
  const numbers = file.itens.flatMap((i) => [...i.candidatos, ...(i.taco_numero != null ? [i.taco_numero] : [])]);
  return new Map(numbers.map((n) => [tacoKey(n), `food-${n}`]));
}

describe('lista do Bocado × TACO — arquivo aprovado', () => {
  it('tem os 197 itens aprovados, sem item repetido no mesmo grupo', () => {
    expect(FILE.itens).toHaveLength(197);
    expect(FILE.aprovado_em).toBe('2026-10-08');
    expect(new Set(FILE.itens.map((i) => `${i.grupo}|${i.item}`)).size).toBe(197);
  });

  it('as escolhas aprovadas viram itens com alimento só quando ligados à TACO', () => {
    const plan = planFoodList(FILE, catalogFor(FILE));
    const byName = (name: string, group?: string) => plan.mappings.find((m) => m.listItemName === name && (!group || m.listGroup === group));
    expect(byName('Peito de frango')?.foodId).toBe('food-410');
    expect(byName('Arroz branco')?.foodId).toBe('food-3');
    expect(byName('Pão de forma')?.foodId).toBeNull();
    expect(byName('Whey protein')?.foodId).toBeNull();
    expect(byName('Churrasco')?.notes).toMatch(/^Não incluir no catálogo/);
    expect(plan.mappings.filter((m) => m.foodId).length).toBe(142);
  });

  it('apelidos: os de itens ligados ligam sozinhos; os demais ficam registrados sem alimento', () => {
    const plan = planFoodList(FILE, catalogFor(FILE));
    const alias = (a: string) => plan.aliases.find((x) => x.alias === a);
    expect(alias('peito de frango')).toMatchObject({ foodId: 'food-410', autoLink: true });
    expect(alias('arroz branco')).toMatchObject({ foodId: 'food-3', autoLink: true });
    expect(alias('whey protein')).toMatchObject({ foodId: null, autoLink: false });
    // "Milho" aparece em dois grupos com a mesma escolha: um apelido só, sem conflito.
    expect(plan.aliases.filter((x) => x.alias === 'milho')).toHaveLength(1);
    expect(alias('milho')).toMatchObject({ foodId: 'food-45', autoLink: true });
    expect(plan.conflictingAliases).toEqual([]);
  });

  it('nº da TACO ausente no catálogo: falha antes de gravar qualquer coisa', () => {
    const catalog = catalogFor(FILE);
    catalog.delete(tacoKey(410));
    expect(() => planFoodList(FILE, catalog)).toThrow(/ausentes no catálogo.*Peito de frango/);
  });

  it('mesmo apelido apontando para alimentos diferentes não liga sozinho', () => {
    const file: FoodListChoiceFile = {
      fonte: 't',
      aprovado_em: '2026-10-08',
      itens: [
        { grupo: 'A', item: 'Milho', status_original: 'precisa_revisao', escolha: 'taco', taco_numero: 45, taco_nome: null, nota: null, candidatos: [45], apelidos: ['milho'] },
        { grupo: 'B', item: 'Milho', status_original: 'precisa_revisao', escolha: 'taco', taco_numero: 44, taco_nome: null, nota: null, candidatos: [44], apelidos: ['milho'] },
      ],
    };
    const plan = planFoodList(file, catalogFor(file));
    expect(plan.conflictingAliases).toEqual(['milho']);
    expect(plan.aliases).toEqual([expect.objectContaining({ alias: 'milho', foodId: null, autoLink: false })]);
  });
});

describe('importação idempotente', () => {
  it('1ª execução cria tudo; 2ª não grava nada; mudar uma escolha só atualiza aquele item', async () => {
    const store = new InMemoryFoodListStore(catalogFor(FILE));

    const first = await importFoodList(store, FILE);
    expect(first.itens).toEqual({ criados: 197, atualizados: 0, semMudanca: 0 });
    expect(first.apelidos.criados).toBe(store.aliases.length);
    expect(store.aliases.every((a) => a.mappingId)).toBe(true);

    const second = await importFoodList(store, FILE);
    expect(second.itens).toEqual({ criados: 0, atualizados: 0, semMudanca: 197 });
    expect(second.apelidos).toMatchObject({ criados: 0, atualizados: 0 });
    expect(store.applyCalls).toBe(1);

    const changed: FoodListChoiceFile = {
      ...FILE,
      itens: FILE.itens.map((i) => (i.item === 'Couve' ? { ...i, taco_numero: 115, nota: 'Crua.' } : i)),
    };
    const third = await importFoodList(store, changed);
    expect(third.itens).toEqual({ criados: 0, atualizados: 1, semMudanca: 196 });
    expect(store.aliases.find((a) => a.alias === 'couve')).toMatchObject({ foodId: 'food-115', autoLink: true });
    expect(store.mappings).toHaveLength(197);
  });
});
