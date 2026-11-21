import { formatPlain } from './evaluation-references';

/**
 * Página "Análise de bioimpedância" do relatório do CLIENTE — no formato do relatório
 * da balança Relaxmedic (iComon), só quando a bioimpedância veio da balança conectada.
 *
 * As faixas e "padrões" reproduzem o que o relatório do fabricante imprime (conferido
 * em 4 relatórios, 2 homens e 2 mulheres):
 * - Peso padrão: IMC 22 (homem) ou 21 (mulher) para a altura; faixa 85–115%.
 * - Gordura: 12–24% (homem) ou 20,1–32,2% (mulher) do peso padrão; padrão = o meio.
 * - Massa magra padrão = peso padrão − gordura padrão; água (73,3%), sal inorgânico
 *   (6,7%), proteína (20%) e músculo (93,3%) dela, com faixa de ±11% (homem) ou
 *   −12,3%/+12% (mulher). Músculo esquelético: 52–63,6% (homem) ou 51,3–62,6%
 *   (mulher) da massa magra padrão.
 * - Por parte do corpo: o próprio relatório diz que é "valor inferido" — o painel divide
 *   a massa muscular e a gordura nas mesmas frações que o app usa (iguais às de
 *   professional-web/src/scale/bodyComposition.ts) e compara com o padrão de cada parte.
 * - SMI = músculo dos braços e pernas ÷ altura²; subcutânea = 71,5% do % de gordura.
 */

export type Sex = 'male' | 'female';

interface SegmentImpedances {
  arms: [number, number];
  legs: [number, number];
  trunk: number;
}

export interface BioimpedanceAnalysisInput {
  sex: Sex | null;
  heightCm: number;
  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  muscleMassKg: number | null;
  bodyWaterPercent: number | null;
  boneMassKg: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
  waistHipRatio: number | null;
  impedanceData: unknown;
}

export type Evaluation = 'Baixo' | 'Saudável' | 'Alto' | 'Excelente';

export interface RangeRow {
  label: string;
  valueKg: number;
  range: [number, number];
  percentOfWeight: number;
  evaluation: Evaluation;
}

export interface Bar {
  label: string;
  value: number;
  unit: string;
  healthy: [number, number];
  /** Fim da escala desenhada. */
  scale: [number, number];
  evaluation: Evaluation;
}

export interface SegmentRow {
  label: string;
  kg: number;
  percentOfStandard: number;
  evaluation: Evaluation;
}

export interface BioimpedanceAnalysis {
  composition: RangeRow[];
  muscleFatBars: Bar[];
  obesityBars: Bar[];
  fatSegments: SegmentRow[];
  muscleSegments: SegmentRow[];
  bodyType: string;
  others: Array<{ label: string; value: string }>;
  impedance: { khz20: SegmentImpedances; khz100: SegmentImpedances } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const STANDARD_BMI: Record<Sex, number> = { male: 22, female: 21 };
const FAT_RANGE_OF_STANDARD_WEIGHT: Record<Sex, [number, number]> = { male: [0.12, 0.24], female: [0.201, 0.322] };
const COMPONENT_RANGE: Record<Sex, [number, number]> = { male: [0.89, 1.11], female: [0.877, 1.12] };
const SKELETAL_RANGE_OF_STANDARD_LEAN: Record<Sex, [number, number]> = { male: [0.52, 0.636], female: [0.5125, 0.6255] };
const HEALTHY_FAT_PERCENT: Record<Sex, [number, number]> = { male: [10, 20], female: [18, 28] };

// Frações da massa muscular e da gordura por parte (mesmas do painel — bodyComposition.ts).
const MUSCLE_SHARE: Record<Sex, { arm: number; leg: number; trunk: number }> = {
  male: { arm: 0.062, leg: 0.178, trunk: 0.467 },
  female: { arm: 0.057, leg: 0.173, trunk: 0.467 },
};
/** Gordura de cada braço/perna (kg) a partir da massa gorda total — igual a fatBySegment do painel. */
const armFat = (fat: number) => Math.max(0.1, -0.401 + 0.0796 * fat);
const legFat = (fat: number) => Math.max(0.1, 0.437 + 0.1346 * fat);
const TRUNK_FAT_SHARE = 0.55;
// Padrão de cada parte, tirado dos "%" que o relatório do fabricante imprime.
const STANDARD_FAT_SEGMENT_OF_STANDARD_WEIGHT: Record<Sex, { arm: number; leg: number; trunk: number }> = {
  male: { arm: 0.0094, leg: 0.025, trunk: 0.0637 },
  female: { arm: 0.0179, leg: 0.042, trunk: 0.095 },
};
const STANDARD_MUSCLE_TOTAL: Record<Sex, { ofStandardWeight: number; ofExcessWeight: number }> = {
  male: { ofStandardWeight: 0.712, ofExcessWeight: 0.319 },
  female: { ofStandardWeight: 0.595, ofExcessWeight: 0.369 },
};
const STANDARD_MUSCLE_SEGMENT_SHARE: Record<Sex, { arm: number; leg: number; trunk: number }> = {
  male: { arm: 0.0634, leg: 0.18, trunk: 0.513 },
  female: { arm: 0.0575, leg: 0.182, trunk: 0.521 },
};

function rangeEvaluation(value: number, [lo, hi]: [number, number], aboveIsGood: boolean): Evaluation {
  if (value < lo) return 'Baixo';
  if (value > hi) return aboveIsGood ? 'Excelente' : 'Alto';
  return 'Saudável';
}

function segmentEvaluation(percent: number, [lo, hi]: [number, number]): Evaluation {
  if (percent < lo) return 'Baixo';
  if (percent > hi) return 'Alto';
  return 'Saudável';
}

function isSegments(value: unknown): value is SegmentImpedances {
  const v = value as SegmentImpedances | null;
  return (
    !!v &&
    Array.isArray(v.arms) &&
    Array.isArray(v.legs) &&
    v.arms.length === 2 &&
    v.legs.length === 2 &&
    [...v.arms, ...v.legs, v.trunk].every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function readImpedance(data: unknown): BioimpedanceAnalysis['impedance'] {
  const d = data as { khz20?: unknown; khz100?: unknown } | null;
  if (!d || typeof d !== 'object' || !isSegments(d.khz20) || !isSegments(d.khz100)) return null;
  return { khz20: d.khz20, khz100: d.khz100 };
}

function bodyType(bmi: number, fatPercent: number, sex: Sex): string {
  const [lo, hi] = HEALTHY_FAT_PERCENT[sex];
  const column = fatPercent < lo ? 0 : fatPercent <= hi ? 1 : 2;
  if (bmi >= 25) return ['Atlético', 'Ligeiramente obeso', 'Obesidade'][column];
  if (bmi >= 18.5) return ['Musculoso', 'Saudável', 'Obesidade invisível'][column];
  return ['Abaixo do peso', 'Abaixo do peso', 'Obesidade invisível'][column];
}

/** null quando falta o mínimo para a análise (sexo, altura, peso, massa gorda e magra). */
export function buildBioimpedanceAnalysis(input: BioimpedanceAnalysisInput): BioimpedanceAnalysis | null {
  const { sex, heightCm, weightKg: weight, fatMassKg: fat, leanMassKg: lean } = input;
  if (!sex || !(heightCm > 0) || weight == null || !(weight > 0) || fat == null || lean == null || !(lean > 0)) return null;

  const h2 = (heightCm / 100) ** 2;
  const standardWeight = STANDARD_BMI[sex] * h2;
  const fatRange = FAT_RANGE_OF_STANDARD_WEIGHT[sex].map((f) => f * standardWeight) as [number, number];
  const standardFat = (fatRange[0] + fatRange[1]) / 2;
  const standardLean = standardWeight - standardFat;
  const [cLo, cHi] = COMPONENT_RANGE[sex];
  const componentRange = (share: number): [number, number] => [share * standardLean * cLo, share * standardLean * cHi];
  const skeletalRange = SKELETAL_RANGE_OF_STANDARD_LEAN[sex].map((f) => f * standardLean) as [number, number];

  const water = input.bodyWaterPercent != null ? (input.bodyWaterPercent / 100) * weight : 0.733 * lean;
  const mineral = input.boneMassKg ?? 0.067 * lean;
  const protein = Math.max(0, lean - water - mineral);
  const muscle = input.muscleMassKg ?? lean - mineral;
  const skeletal = input.skeletalMuscleMassKg ?? (sex === 'male' ? 0.572 : 0.557) * lean;
  const fatPercent = input.bodyFatPercent ?? (fat / weight) * 100;

  const row = (label: string, valueKg: number, range: [number, number], aboveIsGood: boolean): RangeRow => ({
    label,
    valueKg: round1(valueKg),
    range: [round1(range[0]), round1(range[1])],
    percentOfWeight: round1((valueKg / weight) * 100),
    evaluation: rangeEvaluation(valueKg, range, aboveIsGood),
  });
  const weightRange: [number, number] = [0.85 * standardWeight, 1.15 * standardWeight];
  const composition: RangeRow[] = [
    row('Peso', weight, weightRange, false),
    row('Gordura corporal', fat, fatRange, false),
    row('Sal inorgânico', mineral, componentRange(0.067), true),
    row('Proteína', protein, componentRange(0.2), true),
    row('Água corporal', water, componentRange(0.733), true),
    row('Músculo', muscle, componentRange(0.933), true),
    row('Músculo esquelético', skeletal, skeletalRange, true),
  ];

  const bar = (label: string, value: number, healthy: [number, number], unit = ' kg', aboveIsGood = false): Bar => {
    const span = healthy[1] - healthy[0];
    return {
      label,
      value: round1(value),
      unit,
      healthy: [round1(healthy[0]), round1(healthy[1])],
      scale: [Math.max(0, healthy[0] - span), healthy[1] + 2 * span],
      evaluation: rangeEvaluation(value, healthy, aboveIsGood),
    };
  };
  const bmi = weight / h2;
  const muscleFatBars = [
    bar('Peso', weight, weightRange),
    bar('Músculo esquelético', skeletal, skeletalRange, ' kg', true),
    bar('Massa gorda', fat, fatRange),
  ];
  const obesityBars = [bar('IMC', bmi, [18.5, 25], ' kg/m²'), bar('Gordura corporal', fatPercent, HEALTHY_FAT_PERCENT[sex], '%')];

  const share = MUSCLE_SHARE[sex];
  const standardMuscleTotal =
    STANDARD_MUSCLE_TOTAL[sex].ofStandardWeight * standardWeight + STANDARD_MUSCLE_TOTAL[sex].ofExcessWeight * (weight - standardWeight);
  const stdMuscleShare = STANDARD_MUSCLE_SEGMENT_SHARE[sex];
  const muscleSegment = (label: string, kg: number, standard: number): SegmentRow => {
    const percent = (kg / standard) * 100;
    return { label, kg: round1(kg), percentOfStandard: round1(percent), evaluation: segmentEvaluation(percent, [90, 110]) };
  };
  const armMuscle = share.arm * muscle;
  const legMuscle = share.leg * muscle;
  const muscleSegments = [
    muscleSegment('Cada braço', armMuscle, stdMuscleShare.arm * standardMuscleTotal),
    muscleSegment('Tronco', share.trunk * muscle, stdMuscleShare.trunk * standardMuscleTotal),
    muscleSegment('Cada perna', legMuscle, stdMuscleShare.leg * standardMuscleTotal),
  ];

  const stdFatShare = STANDARD_FAT_SEGMENT_OF_STANDARD_WEIGHT[sex];
  const fatSegment = (label: string, kg: number, standard: number): SegmentRow => {
    const percent = (kg / standard) * 100;
    return { label, kg: round1(kg), percentOfStandard: round1(percent), evaluation: segmentEvaluation(percent, [80, 160]) };
  };
  const fatSegments = [
    fatSegment('Cada braço', armFat(fat), stdFatShare.arm * standardWeight),
    fatSegment('Tronco', TRUNK_FAT_SHARE * fat, stdFatShare.trunk * standardWeight),
    fatSegment('Cada perna', legFat(fat), stdFatShare.leg * standardWeight),
  ];

  const others: Array<{ label: string; value: string }> = [];
  if (input.visceralFatLevel != null) others.push({ label: 'Grau de gordura visceral', value: formatPlain(input.visceralFatLevel) });
  if (input.basalMetabolicRateKcal != null) others.push({ label: 'Taxa metabólica basal', value: `${formatPlain(input.basalMetabolicRateKcal)} kcal` });
  others.push({ label: 'Peso corporal livre de gordura', value: `${formatPlain(round1(lean))} kg` });
  others.push({ label: 'Gordura subcutânea', value: `${formatPlain(round1(0.715 * fatPercent))} %` });
  others.push({ label: 'SMI', value: `${formatPlain(round1((2 * armMuscle + 2 * legMuscle) / h2))} kg/m²` });
  if (input.bodyAgeYears != null) others.push({ label: 'Idade do corpo', value: `${input.bodyAgeYears} anos` });
  if (input.waistHipRatio != null) others.push({ label: 'Relação cintura/quadril', value: formatPlain(input.waistHipRatio) });

  return {
    composition,
    muscleFatBars,
    obesityBars,
    fatSegments,
    muscleSegments,
    bodyType: bodyType(bmi, fatPercent, sex),
    others,
    impedance: readImpedance(input.impedanceData),
  };
}

// --- HTML ---------------------------------------------------------------------

const EVAL_COLOR: Record<Evaluation, string> = { Baixo: '#b5651d', Saudável: '#1f7a5c', Alto: '#b5651d', Excelente: '#1f7a5c' };

function evalCell(evaluation: Evaluation): string {
  return `<td class="eval" style="color:${EVAL_COLOR[evaluation]};font-weight:600;">${evaluation}</td>`;
}

function compositionTable(rows: RangeRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${formatPlain(r.valueKg)} <span class="metric-ref" style="display:inline;">(${formatPlain(r.range[0])}–${formatPlain(r.range[1])})</span></td><td class="num">${formatPlain(r.percentOfWeight)}</td>${evalCell(r.evaluation)}</tr>`,
    )
    .join('');
  return `<table class="metric-table"><thead><tr><th></th><th class="r">Medição (kg) e faixa normal</th><th class="r">% do peso</th><th class="r">Avaliação</th></tr></thead><tbody>${body}</tbody></table>`;
}

function barRow(b: Bar): string {
  const [min, max] = b.scale;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const lo = pos(b.healthy[0]);
  const hi = pos(b.healthy[1]);
  const value = pos(b.value);
  return `<tr>
    <td style="width:24%;">${b.label}<span class="metric-ref">Normal: ${formatPlain(b.healthy[0])}–${formatPlain(b.healthy[1])}${b.unit}</span></td>
    <td style="width:58%;">
      <div style="position:relative;height:11px;border-radius:6px;background:#f3ede4;overflow:hidden;">
        <div style="position:absolute;left:${lo}%;width:${hi - lo}%;top:0;bottom:0;background:#dcefe5;"></div>
        <div style="position:absolute;left:0;width:${value}%;top:3px;height:5px;border-radius:3px;background:#123c2e;"></div>
      </div>
      <div style="position:relative;height:10px;font-size:7.5px;color:#8b988e;">
        <span style="position:absolute;left:0;">Baixo</span>
        <span style="position:absolute;left:${(lo + hi) / 2}%;transform:translateX(-50%);">Saudável</span>
        <span style="position:absolute;right:0;">Alto</span>
      </div>
    </td>
    <td class="num">${formatPlain(b.value)}${b.unit}</td>
    ${evalCell(b.evaluation)}
  </tr>`;
}

function barTable(title: string, bars: Bar[]): string {
  return `<h2 class="section-title">${title}</h2><table class="metric-table"><tbody>${bars.map(barRow).join('')}</tbody></table>`;
}

function segmentTable(title: string, rows: SegmentRow[], note: string): string {
  const body = rows
    .map((r) => `<tr><td>${r.label}</td><td class="num">${formatPlain(r.kg)} kg</td><td class="num">${formatPlain(r.percentOfStandard)} %</td>${evalCell(r.evaluation)}</tr>`)
    .join('');
  return `<div><h2 class="section-title">${title}</h2><table class="metric-table"><thead><tr><th></th><th class="r">kg</th><th class="r">% do padrão</th><th class="r">Avaliação</th></tr></thead><tbody>${body}</tbody></table><div class="metric-ref" style="margin-top:3px;">${note}</div></div>`;
}

function impedanceTable(impedance: NonNullable<BioimpedanceAnalysis['impedance']>): string {
  // Os dois braços e as duas pernas lado a lado, sem dizer qual é o direito: a ordem que a
  // balança manda ainda não foi confirmada contra o relatório do fabricante.
  const pair = ([a, b]: [number, number]) => `${formatPlain(round1(a))} · ${formatPlain(round1(b))}`;
  const cells = (z: SegmentImpedances) =>
    [pair(z.arms), formatPlain(round1(z.trunk)), pair(z.legs)].map((v) => `<td class="num">${v}</td>`).join('');
  return `<h2 class="section-title">Impedância bioelétrica</h2>
  <table class="metric-table"><thead><tr><th>Z (Ω)</th><th class="r">Braços</th><th class="r">Tronco</th><th class="r">Pernas</th></tr></thead>
  <tbody><tr><td>20 kHz</td>${cells(impedance.khz20)}</tr><tr><td>100 kHz</td>${cells(impedance.khz100)}</tr></tbody></table>`;
}

export function renderBioimpedancePage(analysis: BioimpedanceAnalysis): string {
  const others = analysis.others.map((o) => `<tr><td>${o.label}</td><td class="num">${o.value}</td></tr>`).join('');
  return `
  <style>
    .bio-page h2.section-title { margin: 8px 0 4px; font-size: 12px; }
    .bio-page table.metric-table th { padding: 3px 6px; font-size: 8.5px; }
    .bio-page table.metric-table th.r { text-align: right; }
    .bio-page table.metric-table td { padding: 2.5px 6px; font-size: 9.5px; }
    .bio-page .metric-ref { font-size: 7.5px; }
    .bio-page .composition-tables { gap: 8px; margin-top: 0; }
    .bio-page .tile .value { font-size: 13px; }
  </style>
  <div class="page-break bio-page">
    <h1 class="page-title">Análise de bioimpedância</h1>
    <h2 class="section-title">Análise da composição corporal</h2>
    ${compositionTable(analysis.composition)}
    ${barTable('Análise de músculo e gordura', analysis.muscleFatBars)}
    ${barTable('Análise de obesidade', analysis.obesityBars)}
    <div class="composition-tables">
      ${segmentTable('Gordura por parte do corpo', analysis.fatSegments, 'Faixa normal: 80% a 160% do padrão. A divisão por parte do corpo é estimada.')}
      ${segmentTable('Músculo por parte do corpo', analysis.muscleSegments, 'Faixa normal: 90% a 110% do padrão. A divisão por parte do corpo é estimada.')}
    </div>
    <div class="composition-tables">
      <div>
        <h2 class="section-title">Tipo de corpo</h2>
        <div class="tile"><div class="label">Pelo IMC e pelo % de gordura</div><div class="value">${analysis.bodyType}</div></div>
      </div>
      <div>
        <h2 class="section-title">Outros indicadores</h2>
        <table class="metric-table"><tbody>${others}</tbody></table>
      </div>
    </div>
    ${analysis.impedance ? impedanceTable(analysis.impedance) : ''}
  </div>`;
}
