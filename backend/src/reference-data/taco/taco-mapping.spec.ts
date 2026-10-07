import { join } from 'path';
import { BOCADO_FOOD_LIST } from './bocado-food-list';
import { AliasEntry, buildAliases, mapBocadoList, MappingRow } from './taco-mapping';
import { parseTaco, TacoFood } from './taco-parser';

describe('Mapeamento da lista do Bocado para a TACO (local, sem escolhas automáticas)', () => {
  let foods: TacoFood[];
  let rows: MappingRow[];
  let aliases: AliasEntry[];
  const row = (name: string, grupo?: string) => rows.find((r) => r.alimento_bocado === name && (!grupo || r.grupo.startsWith(grupo)))!;
  const alias = (a: string) => aliases.find((x) => x.alias === a)!;

  beforeAll(() => {
    foods = parseTaco(join(__dirname, 'source', 'Taco-4a-Edicao.xlsx')).alimentos;
    rows = mapBocadoList(foods);
    aliases = buildAliases(rows, foods);
  });

  it('cobre a lista inteira (8 grupos) e só usa os 4 status permitidos', () => {
    expect(rows).toHaveLength(BOCADO_FOOD_LIST.reduce((n, g) => n + g.itens.length, 0));
    expect(new Set(rows.map((r) => r.grupo)).size).toBe(8);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['encontrado', 'precisa_revisao', 'nao_encontrado', 'fora_da_taco']));
  });

  it('"encontrado" só com UM candidato por nome direto; mais de um, sinônimo ou ressalva → precisa_revisao', () => {
    for (const r of rows) {
      if (r.status === 'encontrado') {
        expect(r.candidatos).toHaveLength(1);
        expect(r.candidato_taco).toBe(r.candidatos[0].nome);
      }
      if (r.candidatos.length > 1) expect(r.status).toBe('precisa_revisao');
      if (r.status === 'nao_encontrado' || r.status === 'fora_da_taco') expect(r.candidatos).toEqual([]);
    }
    const synonyms = BOCADO_FOOD_LIST.flatMap((g) => g.itens).filter((i) => i.sinonimo || i.revisar);
    for (const s of synonyms) expect(rows.filter((r) => r.alimento_bocado === s.nome).every((r) => r.status !== 'encontrado')).toBe(true);
  });

  it('exemplos: clara → nº 486; ovos e arroz branco → revisão entre preparações; aveia → nº 7', () => {
    expect(row('Clara de ovo')).toMatchObject({ status: 'encontrado', candidato_taco: 'Ovo, de galinha, clara, cozida/10minutos' });
    expect(row('Ovos')).toMatchObject({ status: 'precisa_revisao', candidato_taco: null });
    expect(row('Ovos').candidatos.map((c) => c.numero)).toEqual([488, 489, 490]);
    expect(row('Arroz branco').candidatos.map((c) => c.numero)).toEqual([3, 4, 5, 6]);
    expect(row('Arroz branco').status).toBe('precisa_revisao');
    expect(row('Arroz integral').candidatos.map((c) => c.numero)).toEqual([1, 2]);
    expect(row('Aveia')).toMatchObject({ status: 'encontrado', candidato_taco: 'Aveia, flocos, crua' });
    expect(row('Patinho').candidatos.map((c) => c.nome)).toEqual(['Carne, bovina, patinho, sem gordura, cru', 'Carne, bovina, patinho, sem gordura, grelhado']);
  });

  it('defeito da planilha e sinônimos vão para revisão com o motivo; marca/suplemento fica fora da TACO', () => {
    expect(row('Feijoada')).toMatchObject({ status: 'precisa_revisao', candidatos: [{ numero: 540, nome: 'L' }] });
    expect(row('Feijoada').observacao).toContain('"Feijoada"');
    expect(row('Aipim')).toMatchObject({ status: 'precisa_revisao' });
    expect(row('Aipim').observacao).toContain('Aipim = mandioca');
    expect(row('Tapioca', '2.')).toMatchObject({ status: 'precisa_revisao', candidato_taco: 'Tapioca, com manteiga' });
    for (const name of ['Whey protein', 'Caseína', 'Rap10', 'Iogurte grego', 'Cream cheese', 'Bebida de amêndoas']) {
      expect(row(name)).toMatchObject({ status: 'fora_da_taco', candidatos: [] });
    }
    expect(row('Quinoa')).toMatchObject({ status: 'nao_encontrado', candidatos: [] });
  });

  it('nenhum valor nutricional é atribuído no mapeamento (só nomes e números da TACO)', () => {
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['alimento_bocado', 'candidato_taco', 'candidatos', 'grupo', 'observacao', 'status']);
      for (const c of r.candidatos) expect(Object.keys(c).sort()).toEqual(['nome', 'numero']);
    }
  });

  it('apelidos: só liga sozinho o que é inequívoco ("aveia", "clara de ovo"); "ovo/ovos", "banana" e "patinho" pedem revisão', () => {
    expect(alias('aveia')).toMatchObject({ ligar_automaticamente: true, candidatos: [{ numero: 7 }] });
    expect(alias('clara de ovo')).toMatchObject({ ligar_automaticamente: true, candidatos: [{ numero: 486 }] });
    for (const a of ['ovo', 'ovos', 'banana', 'patinho', 'arroz branco', 'arroz integral']) {
      expect(alias(a)).toMatchObject({ ligar_automaticamente: false, status: 'precisa_revisao' });
    }
    expect(aliases.filter((a) => a.ligar_automaticamente).every((a) => a.candidatos.length === 1 && a.status === 'encontrado')).toBe(true);
    expect(new Set(aliases.map((a) => a.alias)).size).toBe(aliases.length);
  });
});
