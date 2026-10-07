import { readFileSync } from 'fs';
import { join } from 'path';
import { buildTacoCatalog, catalogStats, REQUIRED_MACROS, TacoCatalogRecord, tacoSourceKey } from './taco-catalog';
import { importTacoCatalog, LEGACY_TACO_SOURCE } from './taco-catalog-import';
import { CatalogFoodRow, InMemoryTacoCatalogStore } from './taco-catalog-stores';
import { mapBocadoList } from './taco-mapping';
import { parseTaco } from './taco-parser';

const SYSTEM = 'conta-sistema';
const LEGACY = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'foods.json'), 'utf8')) as Array<{
  name: string;
  kcalPer100: number;
  proteinGPer100: number;
  carbGPer100: number;
  fatGPer100: number;
  fiberGPer100?: number;
}>;

function legacyRow(food: (typeof LEGACY)[number], id: string, createdBy = SYSTEM): CatalogFoodRow {
  return {
    id,
    name: food.name,
    scope: 'global',
    source: LEGACY_TACO_SOURCE,
    createdByProfessionalId: createdBy,
    approvedAt: null,
    sourceKey: null,
    sourceEdition: null,
    sourceNumber: null,
    sourceHash: null,
    foodGroup: null,
    preparation: null,
    kcalPer100: food.kcalPer100,
    proteinGPer100: food.proteinGPer100,
    carbGPer100: food.carbGPer100,
    fatGPer100: food.fatGPer100,
    fiberGPer100: food.fiberGPer100 ?? null,
    sodiumMgPer100: null,
    sourceData: null,
  };
}

describe('Catálogo oficial TACO 4ª edição (todos os registros, sem converter marcadores)', () => {
  let records: TacoCatalogRecord[];
  const byNumber = (n: number) => records.find((r) => r.sourceNumber === n)!;

  beforeAll(() => {
    records = buildTacoCatalog(parseTaco(join(__dirname, 'source', 'Taco-4a-Edicao.xlsx')));
  });

  it('gera um registro por alimento da planilha (597), com chave estável única e origem TACO 4ª edição', () => {
    expect(records).toHaveLength(597);
    expect(new Set(records.map((r) => r.sourceKey)).size).toBe(597);
    expect(byNumber(410)).toMatchObject({
      sourceKey: 'taco4:410',
      source: 'taco4',
      sourceEdition: 'TACO 4ª edição',
      name: 'Frango, peito, sem pele, grelhado',
      foodGroup: 'Carnes e derivados',
      preparation: 'grelhado',
      baseUnit: 'g',
      referencePortion: '100 g de parte comestível',
    });
    expect(byNumber(224).name).toBe(' Mamão, doce em calda, drenado'); // nome exato, com o espaço da planilha
    expect(Object.keys(byNumber(1).nutrients)).toHaveLength(26);
  });

  it('Tr, NA, * e vazio NUNCA viram 0: o campo numérico fica null e o marcador original fica guardado', () => {
    for (const r of records) {
      for (const [key, cell] of Object.entries(r.macros)) {
        const value = r.values[key as keyof typeof r.values];
        if (cell.situacao === 'valor') expect(value).toBe(cell.valor);
        else expect(value).toBeNull();
      }
    }
    const leite = byNumber(458);
    expect(leite.values).toMatchObject({ kcal: null, proteina: null, carboidrato: null, lipideos: null, fibra: null });
    expect(leite.macros.kcal).toEqual({ valor: null, situacao: 'em_reavaliacao', bruto: '*' });
    expect(leite.macros.fibra).toEqual({ valor: null, situacao: 'nao_aplicavel', bruto: 'NA' });
    expect(byNumber(260).macros.carboidrato).toEqual({ valor: null, situacao: 'nao_aplicavel', bruto: 'NA' });
    expect(byNumber(91).macros.lipideos).toEqual({ valor: null, situacao: 'traco', bruto: 'Tr' });
    expect(byNumber(410).values.carboidrato).toBe(0); // zero que ESTÁ na planilha continua zero
    expect(byNumber(373).nutrients.piridoxina).toEqual({ valor: null, situacao: 'invalido', bruto: ',0,02' });
  });

  it('contagem de completude e marcadores bate com a planilha', () => {
    const stats = catalogStats(records);
    expect(stats.registros).toBe(597);
    expect(stats.comMarcadorNosObrigatorios).toBe(49);
    expect(stats.macrosObrigatoriosNumericos).toBe(597 - 49);
    expect(stats.principaisNumericos).toBeLessThanOrEqual(stats.macrosObrigatoriosNumericos);
    expect(stats.todasAsColunasNumericas).toBeLessThanOrEqual(stats.principaisNumericos);
    expect(stats.comMarcador + stats.todasAsColunasNumericas).toBe(597);
    expect(stats.porMarcador.invalido).toEqual({ registros: 1, celulas: 1 });
  });

  it('o hash muda só quando o conteúdo da fonte muda', () => {
    const again = buildTacoCatalog(parseTaco(join(__dirname, 'source', 'Taco-4a-Edicao.xlsx')));
    expect(again.map((r) => r.contentHash)).toEqual(records.map((r) => r.contentHash));
    expect(new Set(records.map((r) => r.contentHash)).size).toBe(597);
  });

  describe('importação idempotente', () => {
    const now = new Date('2026-10-07T12:00:00Z');

    it('banco vazio: insere os 597 aprovados; reimportar não escreve nada', async () => {
      const store = new InMemoryTacoCatalogStore(SYSTEM);
      const first = await importTacoCatalog(store, records, now);
      expect(first).toMatchObject({ encontrados: 597, inseridos: 597, atualizados: 0, ignorados: 0, duplicados: 0 });
      expect(store.rows).toHaveLength(597);
      expect(store.rows.every((r) => r.approvedAt?.getTime() === now.getTime() && r.scope === 'global')).toBe(true);

      const writes = { ...store.writes };
      const second = await importTacoCatalog(store, records, new Date('2026-10-08T12:00:00Z'));
      expect(second).toMatchObject({ encontrados: 597, inseridos: 0, atualizados: 0, ignorados: 597, duplicados: 0 });
      expect(store.writes).toEqual(writes);
      expect(store.rows).toHaveLength(597);
      expect(store.rows.every((r) => r.approvedAt?.getTime() === now.getTime())).toBe(true); // aprovação original preservada
    });

    it('adota os alimentos antigos pelo nome exato (mesmo id), sem duplicar; os de profissional não são tocados', async () => {
      const store = new InMemoryTacoCatalogStore(SYSTEM);
      LEGACY.forEach((food, i) => store.rows.push(legacyRow(food, `antigo-${i}`)));
      const fromProfessional = legacyRow(LEGACY[0], 'do-profissional', 'outro-profissional');
      store.rows.push(fromProfessional);

      const report = await importTacoCatalog(store, records, now);
      const motivos = (m: string) => report.detalhes.atualizados.filter((u) => u.motivo === m);
      expect(motivos('adotado_do_catalogo_antigo')).toHaveLength(31);
      expect(motivos('adotado_por_decisao_explicita').map((u) => u.chave)).toEqual(['taco4:52', 'taco4:53']);
      expect(report.detalhes.antigosSemCorrespondencia).toEqual([]);
      expect(report).toMatchObject({ inseridos: 597 - LEGACY.length, atualizados: LEGACY.length, duplicados: 0 });
      expect(store.rows.filter((r) => r.sourceKey)).toHaveLength(597);
      expect(store.rows).toHaveLength(597 + 1); // + o do profissional; nenhum antigo sobrou sem chave

      // Pães ligados por decisão: mesmo registro antigo, agora com o nome e os valores oficiais.
      const frances = store.rows.find((r) => r.sourceKey === 'taco4:53')!;
      expect(frances.id).toBe(`antigo-${LEGACY.findIndex((f) => f.name === 'Pão, francês')}`);
      expect(frances).toMatchObject({ name: 'Pão, trigo, francês', kcalPer100: byNumber(53).values.kcal });
      expect(store.rows.find((r) => r.sourceKey === 'taco4:52')).toMatchObject({ name: 'Pão, trigo, forma, integral' });

      const arroz = store.rows.find((r) => r.name === 'Arroz, tipo 1, cozido' && r.sourceKey)!;
      expect(arroz.id).toMatch(/^antigo-/); // mesmo registro antigo, agora com chave e valores exatos
      expect(arroz).toMatchObject({ sourceKey: 'taco4:3', source: 'taco4', kcalPer100: byNumber(3).values.kcal });
      expect(store.rows.find((r) => r.id === 'do-profissional')).toEqual(fromProfessional);

      const again = await importTacoCatalog(store, records, now);
      expect(again).toMatchObject({ inseridos: 0, atualizados: 0, ignorados: 597, duplicados: 0 });
    });

    it('conteúdo da fonte mudou → atualiza só aquele registro; aprovação pendente → aprova', async () => {
      const store = new InMemoryTacoCatalogStore(SYSTEM);
      await importTacoCatalog(store, records, now);
      const changed = records.map((r) => (r.sourceNumber === 7 ? { ...r, contentHash: 'outro-hash' } : r));
      store.rows.find((r) => r.sourceKey === 'taco4:8')!.approvedAt = null;
      const report = await importTacoCatalog(store, changed, now);
      expect(report).toMatchObject({ inseridos: 0, atualizados: 2, ignorados: 595 });
      expect(report.detalhes.atualizados).toEqual([
        { chave: 'taco4:7', nome: 'Aveia, flocos, crua', motivo: 'conteudo_da_fonte_mudou' },
        expect.objectContaining({ chave: 'taco4:8', motivo: 'aprovacao_pendente' }),
      ]);
    });

    it('duplicidades são relatadas e não escritas: chave repetida na fonte, dois antigos com o mesmo nome', async () => {
      const store = new InMemoryTacoCatalogStore(SYSTEM);
      store.rows.push(legacyRow(LEGACY[0], 'antigo-a'), legacyRow(LEGACY[0], 'antigo-b'));
      const report = await importTacoCatalog(store, [...records, records[0]], now);
      expect(report.duplicados).toBe(2);
      expect(report.detalhes.duplicados.map((d) => d.motivo)).toEqual(
        expect.arrayContaining(['chave repetida na fonte', '2 alimentos antigos com o mesmo nome']),
      );
      expect(store.rows.filter((r) => r.id.startsWith('antigo-')).every((r) => r.sourceKey === null)).toBe(true);
      expect(report.inseridos).toBe(596);
    });

    it('nunca apaga: alimento com chave que saiu da fonte continua no banco', async () => {
      const store = new InMemoryTacoCatalogStore(SYSTEM);
      await importTacoCatalog(store, records, now);
      const report = await importTacoCatalog(store, records.slice(1), now);
      expect(report.ignorados).toBe(596);
      expect(store.rows.some((r) => r.sourceKey === tacoSourceKey(1))).toBe(true);
    });
  });

  it('mapeamento dos 197 fica separado: todo candidato existe no catálogo; fora_da_taco não aponta para a TACO; revisão segue sem escolha', () => {
    const rows = mapBocadoList(parseTaco(join(__dirname, 'source', 'Taco-4a-Edicao.xlsx')).alimentos);
    const keys = new Set(records.map((r) => r.sourceKey));
    expect(rows).toHaveLength(197);
    for (const row of rows) for (const c of row.candidatos) expect(keys.has(tacoSourceKey(c.numero))).toBe(true);
    expect(rows.filter((r) => r.status === 'fora_da_taco').every((r) => r.candidatos.length === 0 && r.candidato_taco === null)).toBe(true);
    expect(rows.filter((r) => r.status === 'precisa_revisao')).toHaveLength(99); // sem decisão explícita, nada muda de status
    expect(REQUIRED_MACROS).toEqual(['kcal', 'proteina', 'carboidrato', 'lipideos']);
  });
});
