import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeFoodText, parseTaco, TacoDataset, TACO_SOURCE } from './taco-parser';

const SOURCE = join(__dirname, 'source', 'Taco-4a-Edicao.xlsx');
const sha256 = () => createHash('sha256').update(readFileSync(SOURCE)).digest('hex');

describe('TACO 4ª edição — leitura da planilha oficial (somente leitura)', () => {
  let dataset: TacoDataset;
  let hashBefore: string;

  beforeAll(() => {
    hashBefore = sha256();
    dataset = parseTaco(SOURCE);
  });

  it('não altera o arquivo de origem e registra a sua identificação', () => {
    expect(sha256()).toBe(hashBefore);
    expect(dataset.arquivo).toEqual({ nome: 'Taco-4a-Edicao.xlsx', bytes: 322270, sha256: hashBefore });
    expect(dataset.fonte).toBe(TACO_SOURCE);
  });

  it('lê as 3 abas: composição/minerais/vitaminas (597), ácidos graxos (423) e aminoácidos (26)', () => {
    expect(dataset.abas.map((a) => [a.nome, a.alimentos, a.colunas.length])).toEqual([
      ['CMVCol taco3', 597, 26],
      ['AGtaco3', 423, 22],
      ['Aminoácidos TACO3', 26, 18],
    ]);
    expect(dataset.abas[0].colunas.map((c) => c.chave)).toEqual([
      'umidade', 'energia_kcal', 'energia_kj', 'proteina', 'lipideos', 'colesterol', 'carboidrato', 'fibra_alimentar', 'cinzas',
      'calcio', 'magnesio', 'manganes', 'fosforo', 'ferro', 'sodio', 'potassio', 'cobre', 'zinco',
      'retinol', 're', 'rae', 'tiamina', 'riboflavina', 'piridoxina', 'niacina', 'vitamina_c',
    ]);
    expect(dataset.abas[0].colunas.find((c) => c.chave === 'energia_kcal')).toEqual({ chave: 'energia_kcal', rotulo: 'Energia', unidade: 'kcal' });
    expect(dataset.abas[0].colunas.find((c) => c.chave === 'carboidrato')?.rotulo).toBe('Carboidrato');
  });

  it('597 alimentos com número único 1..597, em 15 grupos; cada um com fonte, porção de 100 g e origem', () => {
    const numbers = dataset.alimentos.map((a) => a.numero);
    expect(numbers).toEqual(Array.from({ length: 597 }, (_, i) => i + 1));
    expect(dataset.grupos.map((g) => g.nome)).toEqual([
      'Cereais e derivados', 'Verduras, hortaliças e derivados', 'Frutas e derivados', 'Gorduras e óleos', 'Pescados e frutos do mar',
      'Carnes e derivados', 'Leite e derivados', 'Bebidas (alcoólicas e não alcoólicas)', 'Ovos e derivados', 'Produtos açucarados',
      'Miscelâneas', 'Outros alimentos industrializados', 'Alimentos preparados', 'Leguminosas e derivados', 'Nozes e sementes',
    ]);
    expect(dataset.grupos.reduce((sum, g) => sum + g.alimentos, 0)).toBe(597);
    for (const food of dataset.alimentos) {
      expect(food).toMatchObject({ fonte: 'TACO 4ª edição', porcaoReferencia: '100 g de parte comestível', origem: { aba: 'CMVCol taco3' } });
      expect(food.nomeNormalizado).toBe(normalizeFoodText(food.nome));
    }
  });

  it('preserva o nome original EXATO (espaços e grafias da TACO) e os valores sem arredondar', () => {
    const byNumber = (n: number) => dataset.alimentos.find((a) => a.numero === n)!;
    expect(byNumber(224).nome).toBe(' Mamão, doce em calda, drenado');
    expect(byNumber(357).nome).toBe('Carne, bovina, filé mingnon, sem gordura, cru');
    const arroz = byNumber(3);
    expect(arroz).toMatchObject({ nome: 'Arroz, tipo 1, cozido', grupo: 'Cereais e derivados', preparacao: 'cozido' });
    expect(arroz.nutrientes.energia_kcal).toEqual({ valor: 128.25848566666664, situacao: 'valor', bruto: 128.25848566666664 });
    expect(arroz.nutrientes.colesterol).toEqual({ valor: null, situacao: 'nao_aplicavel', bruto: 'NA' });
    expect(arroz.nutrientes.tiamina).toEqual({ valor: null, situacao: 'traco', bruto: 'Tr' });
    expect(byNumber(410)).toMatchObject({ nome: 'Frango, peito, sem pele, grelhado', preparacao: 'grelhado' });
    expect(byNumber(488).preparacao).toBe('cozido/10minutos');
  });

  it('marcadores da TACO nunca viram número: Tr, NA, * e vazio têm situação própria', () => {
    const situations = new Set(dataset.alimentos.flatMap((a) => Object.values(a.nutrientes).map((v) => v.situacao)));
    expect([...situations].sort()).toEqual(['em_reavaliacao', 'invalido', 'nao_analisado', 'nao_aplicavel', 'traco', 'valor']);
    for (const food of dataset.alimentos) {
      for (const value of Object.values(food.nutrientes)) {
        if (value.situacao === 'valor') expect(typeof value.valor).toBe('number');
        else expect(value.valor).toBeNull();
      }
    }
  });

  it('inconsistências da planilha ficam registradas, sem correção automática', () => {
    const paleta = dataset.alimentos.find((a) => a.numero === 373)!;
    expect(paleta.nutrientes.piridoxina).toEqual({ valor: null, situacao: 'invalido', bruto: ',0,02' });
    const n540 = dataset.alimentos.find((a) => a.numero === 540)!;
    expect(n540.nome).toBe('L');
    expect(n540.acidosGraxos).toBeNull(); // na aba de ácidos graxos o 540 se chama "Feijoada": não associa
    expect(dataset.alimentos.find((a) => a.numero === 468)!.aminoacidos).toBeNull(); // aminoácidos nº 468 = "Maria mole"
    expect(dataset.inconsistencias).toEqual(
      expect.arrayContaining([
        expect.stringContaining('valor inválido em "Piridoxina": ",0,02"'),
        expect.stringContaining('nº 540: nome suspeito "L"'),
        expect.stringContaining('AGtaco3: nº 540 tem nome diferente ("Feijoada"'),
        expect.stringContaining('Aminoácidos TACO3: nº 468 tem nome diferente ("Maria mole"'),
        expect.stringContaining('("taco3") embora o arquivo seja da 4ª edição'),
      ]),
    );
  });

  it('ácidos graxos e aminoácidos só se associam quando número E nome batem', () => {
    const withFatty = dataset.alimentos.filter((a) => a.acidosGraxos);
    const withAmino = dataset.alimentos.filter((a) => a.aminoacidos);
    expect(withFatty).toHaveLength(422);
    expect(withAmino).toHaveLength(25);
    expect(dataset.alimentos.find((a) => a.numero === 1)!.acidosGraxos!.saturados.situacao).toBeDefined();
  });
});
