import { buildBioimpedanceAnalysis, renderBioimpedancePages, type BioimpedanceAnalysisInput, type Evaluation } from './bioimpedance-analysis';

interface Caso {
  input: BioimpedanceAnalysisInput;
  /** Faixas normais que o relatório do fabricante imprimiu: peso, gordura, sal, proteína, água, músculo, esquelético. */
  faixas: Array<[number, number]>;
  avaliacoes: Evaluation[];
  musculoPct: { braco: number; tronco: number; perna: number };
  gorduraPct: { braco: number; tronco: number; perna: number };
  smi: number;
  tipo: string;
  /** Avaliação do app em braço, tronco e perna: gordura e músculo. */
  avalGordura: [Evaluation, Evaluation, Evaluation];
  avalMusculo: [Evaluation, Evaluation, Evaluation];
}

const base = { origin: 'device' as const, equipment: null, visceralFatLevel: null, basalMetabolicRateKcal: null, bodyAgeYears: null, waistHipRatio: null, impedanceData: null };

// 4 relatórios da balança (sem nomes): os valores do próprio app entram e as faixas/avaliações têm de sair iguais.
const CASOS: Caso[] = [
  {
    input: { ...base, sex: 'male', heightCm: 172, weightKg: 77.8, bodyFatPercent: 17.8, fatMassKg: 13.8, leanMassKg: 63.9, skeletalMuscleMassKg: 36.4, muscleMassKg: 59.6, bodyWaterPercent: 60.2, boneMassKg: 4.3 },
    faixas: [[55.3, 74.8], [7.8, 15.7], [3.2, 4.0], [9.5, 11.8], [34.8, 43.4], [44.3, 55.2], [27.8, 34.0]],
    avaliacoes: ['Alto', 'Saudável', 'Excelente', 'Excelente', 'Excelente', 'Excelente', 'Excelente'],
    musculoPct: { braco: 118.2, tronco: 108.0, perna: 117.2 },
    gorduraPct: { braco: 99.6, tronco: 187.8, perna: 141.1 },
    smi: 9.7,
    tipo: 'Ligeiramente obeso',
    avalGordura: ['Saudável', 'Alto', 'Saudável'],
    avalMusculo: ['Alto', 'Saudável', 'Alto'],
  },
  {
    input: { ...base, sex: 'female', heightCm: 167, weightKg: 69.2, bodyFatPercent: 23.9, fatMassKg: 16.5, leanMassKg: 52.6, skeletalMuscleMassKg: 29.6, muscleMassKg: 49.1, bodyWaterPercent: 55.8, boneMassKg: 3.5 },
    faixas: [[49.8, 67.4], [11.7, 18.8], [2.5, 3.3], [7.6, 9.7], [27.9, 35.6], [35.5, 45.3], [22.3, 27.3]],
    avaliacoes: ['Alto', 'Saudável', 'Excelente', 'Excelente', 'Excelente', 'Excelente', 'Excelente'],
    musculoPct: { braco: 129.2, tronco: 113.4, perna: 121.4 },
    gorduraPct: { braco: 95.2, tronco: 167.0, perna: 108.4 },
    smi: 8.2,
    tipo: 'Saudável',
    avalGordura: ['Saudável', 'Alto', 'Saudável'],
    avalMusculo: ['Alto', 'Alto', 'Alto'],
  },
  {
    input: { ...base, sex: 'male', heightCm: 169, weightKg: 103.25, bodyFatPercent: 35.9, fatMassKg: 37.1, leanMassKg: 66.1, skeletalMuscleMassKg: 37.9, muscleMassKg: 61.7, bodyWaterPercent: 47.0, boneMassKg: 4.4 },
    faixas: [[53.4, 72.3], [7.5, 15.0], [3.1, 3.8], [9.2, 11.4], [33.6, 41.9], [42.8, 53.4], [26.7, 32.7]],
    avaliacoes: ['Alto', 'Alto', 'Excelente', 'Excelente', 'Excelente', 'Excelente', 'Excelente'],
    musculoPct: { braco: 107.7, tronco: 97.7, perna: 106.0 },
    gorduraPct: { braco: 419.3, tronco: 513.1, perna: 347.6 },
    smi: 10.5,
    tipo: 'Obesidade',
    avalGordura: ['Alto', 'Alto', 'Alto'],
    avalMusculo: ['Saudável', 'Saudável', 'Saudável'],
  },
  {
    input: { ...base, sex: 'female', heightCm: 156, weightKg: 65.95, bodyFatPercent: 36.6, fatMassKg: 24.1, leanMassKg: 41.9, skeletalMuscleMassKg: 23.0, muscleMassKg: 39.1, bodyWaterPercent: 46.5, boneMassKg: 2.8 },
    faixas: [[43.4, 58.8], [10.3, 16.5], [2.2, 2.8], [6.6, 8.5], [24.3, 31.0], [31.0, 39.5], [19.3, 23.5]],
    // O app marcou o sal inorgânico (2,8 kg, no limite da faixa) como "Excelente"; aqui ele fica "Saudável".
    avaliacoes: ['Alto', 'Alto', 'Saudável', 'Saudável', 'Saudável', 'Saudável', 'Saudável'],
    musculoPct: { braco: 102.0, tronco: 96.6, perna: 101.3 },
    gorduraPct: { braco: 185.8, tronco: 251.4, perna: 169.5 },
    smi: 7.2,
    tipo: 'Obesidade',
    avalGordura: ['Alto', 'Alto', 'Alto'],
    avalMusculo: ['Saudável', 'Saudável', 'Saudável'],
  },
];

describe('análise de bioimpedância no formato do relatório da balança', () => {
  it.each(CASOS.map((c) => [`${c.input.sex} ${c.input.heightCm} cm ${c.input.weightKg} kg`, c] as const))('%s: igual ao relatório do fabricante', (_, c) => {
    const a = buildBioimpedanceAnalysis(c.input)!;
    a.composition.forEach((row, i) => {
      // Músculo esquelético da mulher varia um pouco mais com a altura do que a conta usa.
      const tolerancia = row.label === 'Músculo esquelético' ? 0.25 : 0.15;
      expect(Math.abs(row.range[0] - c.faixas[i][0])).toBeLessThanOrEqual(tolerancia);
      expect(Math.abs(row.range[1] - c.faixas[i][1])).toBeLessThanOrEqual(tolerancia);
    });
    expect(a.composition.map((r) => r.evaluation)).toEqual(c.avaliacoes);

    // Por parte do corpo: o app também estima; a avaliação tem de bater e o % ficar perto.
    const { arm: bracoM, trunk: troncoM, leg: pernaM } = a.muscleSegments!;
    expect(Math.abs(bracoM.percentOfStandard - c.musculoPct.braco)).toBeLessThanOrEqual(8);
    expect(Math.abs(troncoM.percentOfStandard - c.musculoPct.tronco)).toBeLessThanOrEqual(3);
    expect(Math.abs(pernaM.percentOfStandard - c.musculoPct.perna)).toBeLessThanOrEqual(3);
    const { arm: bracoG, trunk: troncoG, leg: pernaG } = a.fatSegments!;
    expect(Math.abs(bracoG.percentOfStandard / c.gorduraPct.braco - 1)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(troncoG.percentOfStandard / c.gorduraPct.tronco - 1)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(pernaG.percentOfStandard / c.gorduraPct.perna - 1)).toBeLessThanOrEqual(0.1);

    const partes = (s: NonNullable<typeof a.fatSegments>) => [s.arm.evaluation, s.trunk.evaluation, s.leg.evaluation];
    expect(partes(a.fatSegments!)).toEqual(c.avalGordura);
    expect(partes(a.muscleSegments!)).toEqual(c.avalMusculo);

    const smi = a.others.find((o) => o.label.startsWith('SMI'))!.value!;
    expect(Math.abs(parseFloat(smi.replace(',', '.')) - c.smi)).toBeLessThanOrEqual(0.3);
    expect(a.bodyType).toBe(c.tipo);
  });

  it('sem sexo ou peso não monta a análise', () => {
    const c = CASOS[0].input;
    expect(buildBioimpedanceAnalysis({ ...c, sex: null })).toBeNull();
    expect(buildBioimpedanceAnalysis({ ...c, weightKg: null })).toBeNull();
  });

  it('bioimpedância digitada (outro aparelho): só o que foi registrado, sem inventar nem dividir por parte do corpo', () => {
    const a = buildBioimpedanceAnalysis({
      ...base,
      origin: 'manual',
      sex: 'female',
      heightCm: 160,
      weightKg: 70,
      bodyFatPercent: null,
      fatMassKg: null,
      leanMassKg: null,
      skeletalMuscleMassKg: 22,
      muscleMassKg: null,
      bodyWaterPercent: 50,
      boneMassKg: null,
      visceralFatLevel: 7,
    })!;
    const valor = (label: string) => a.composition.find((r) => r.label === label)!.valueKg;
    // Sem % de gordura na bioimpedância: nada de usar o das dobras.
    expect(valor('Gordura corporal')).toBeNull();
    expect(valor('Sal inorgânico')).toBeNull();
    expect(valor('Proteína')).toBeNull();
    expect(valor('Músculo')).toBeNull();
    expect(valor('Água corporal')).toBe(35);
    expect(valor('Músculo esquelético')).toBe(22);
    expect(a.fatSegments).toBeNull();
    expect(a.muscleSegments).toBeNull();
    expect(a.impedance).toBeNull();
    expect(a.bodyType).toBeNull();
    expect(a.obesityBars.map((b) => b.label)).toEqual(['IMC']);
    expect(a.others.find((o) => o.label === 'Gordura subcutânea')!.value).toBeNull();

    const html = renderBioimpedancePages(a, '21/11/2026');
    expect(html).toContain('Não informado');
    expect(html).toContain('Valores de bioimpedância registrados');
    expect(html).not.toContain('por parte do corpo</h1>');
  });

  it('monta a página com as impedâncias quando a balança mandou', () => {
    const analysis = buildBioimpedanceAnalysis({
      ...CASOS[0].input,
      visceralFatLevel: 4,
      bodyAgeYears: 34,
      impedanceData: {
        khz20: { arms: [245.9, 241.1], legs: [214.1, 210.3], trunk: 13.5 },
        khz100: { arms: [212.3, 206.3], legs: [190.1, 188.5], trunk: 8.5 },
      },
    })!;
    const html = renderBioimpedancePages(analysis, '20/11/2026');
    expect(html).toContain('Medido pela balança de bioimpedância conectada');
    expect(html).toContain('Análise segmentar de gordura');
    expect(html).toContain('Equilíbrio muscular');
    expect(html).toContain('Impedância bioelétrica');
    expect(html).toContain('245,9 · 241,1');
    expect(html).not.toMatch(/direit|esquerd/);
    expect(html).toContain('Grau de gordura visceral');
    expect(html).toContain('Ligeiramente obeso');
    expect(renderBioimpedancePages(buildBioimpedanceAnalysis(CASOS[0].input)!, '20/11/2026')).not.toContain('Impedância bioelétrica');
  });
});
