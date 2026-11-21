import { formatPlain } from './evaluation-references';

/**
 * Seção "Bioimpedância" dos relatórios (cliente e profissional), organizada como o
 * relatório da balança Relaxmedic (iComon), com a identidade do Bocado de Nutrição.
 *
 * Só usa o que foi REGISTRADO na bioimpedância da avaliação — nunca o % de gordura das
 * dobras cutâneas. O que não foi registrado aparece como "Não informado".
 *
 * As faixas e "padrões" reproduzem o que o relatório do fabricante imprime (conferido
 * em 4 relatórios, 2 homens e 2 mulheres):
 * - Peso padrão: IMC 22 (homem) ou 21 (mulher) para a altura; faixa 85–115%.
 * - Gordura: 12–24% (homem) ou 20,1–32,2% (mulher) do peso padrão; padrão = o meio.
 * - Massa magra padrão = peso padrão − gordura padrão; água (73,3%), sal inorgânico
 *   (6,7%), proteína (20%) e músculo (93,3%) dela, com faixa de ±11% (homem) ou
 *   −12,3%/+12% (mulher). Músculo esquelético: 52–63,6% (homem) ou 51,25–62,55%
 *   (mulher) da massa magra padrão.
 * - Por parte do corpo (só com a balança conectada): o próprio relatório diz que é "valor
 *   inferido" — a massa muscular e a gordura são divididas nas mesmas contas que o app usa
 *   (iguais às de professional-web/src/scale/bodyComposition.ts) e comparadas com o
 *   padrão de cada parte.
 * - SMI = músculo dos braços e pernas ÷ altura²; subcutânea = 71,5% do % de gordura
 *   (relações da balança — só com a balança conectada).
 */

export type Sex = 'male' | 'female';

interface SegmentImpedances {
  arms: [number, number];
  legs: [number, number];
  trunk: number;
}

export interface BioimpedanceAnalysisInput {
  /** device = balança conectada pelo painel; manual = números digitados de outro aparelho. */
  origin: 'device' | 'manual';
  equipment: string | null;
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
  /** null = não registrado na bioimpedância. */
  valueKg: number | null;
  range: [number, number];
  percentOfWeight: number | null;
  evaluation: Evaluation | null;
}

export interface Bar {
  label: string;
  value: number;
  unit: string;
  /** Posição da barra: valor em % do padrão (ou o próprio valor, no IMC e no % de gordura). */
  position: number;
  ticks: number[];
  healthy: [number, number];
  evaluation: Evaluation;
}

export interface SegmentRow {
  label: string;
  kg: number;
  percentOfStandard: number;
  evaluation: Evaluation;
}

export interface Segments {
  arm: SegmentRow;
  trunk: SegmentRow;
  leg: SegmentRow;
}

export interface BioimpedanceAnalysis {
  origin: 'device' | 'manual';
  equipment: string | null;
  composition: RangeRow[];
  muscleFatBars: Bar[];
  obesityBars: Bar[];
  /** Só com a balança conectada (divisão estimada como no app da balança). */
  fatSegments: Segments | null;
  muscleSegments: Segments | null;
  bodyType: string | null;
  others: Array<{ label: string; value: string | null }>;
  impedance: { khz20: SegmentImpedances; khz100: SegmentImpedances } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const STANDARD_BMI: Record<Sex, number> = { male: 22, female: 21 };
const FAT_RANGE_OF_STANDARD_WEIGHT: Record<Sex, [number, number]> = { male: [0.12, 0.24], female: [0.201, 0.322] };
const COMPONENT_RANGE: Record<Sex, [number, number]> = { male: [0.89, 1.11], female: [0.877, 1.12] };
const SKELETAL_RANGE_OF_STANDARD_LEAN: Record<Sex, [number, number]> = { male: [0.52, 0.636], female: [0.5125, 0.6255] };
const HEALTHY_FAT_PERCENT: Record<Sex, [number, number]> = { male: [10, 20], female: [18, 28] };

// Escalas das barras, como no relatório da balança.
const WEIGHT_TICKS = [55, 70, 85, 100, 115, 130, 145, 160, 175, 190, 205];
const SKELETAL_TICKS = [70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170];
const FAT_MASS_TICKS = [40, 60, 80, 100, 160, 220, 280, 340, 400, 460, 520];
const BMI_TICKS = [10, 15, 18.5, 22, 25, 30, 35, 40, 45, 50, 55];
const FAT_PERCENT_TICKS: Record<Sex, number[]> = {
  male: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  female: [8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58],
};

// Divisão por parte (mesmas contas do painel — bodyComposition.ts).
const MUSCLE_SHARE: Record<Sex, { arm: number; leg: number; trunk: number }> = {
  male: { arm: 0.062, leg: 0.178, trunk: 0.467 },
  female: { arm: 0.057, leg: 0.173, trunk: 0.467 },
};
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

/** null quando falta o mínimo para comparar com o padrão (sexo, altura e peso). */
export function buildBioimpedanceAnalysis(input: BioimpedanceAnalysisInput): BioimpedanceAnalysis | null {
  const { sex, heightCm, weightKg: weight } = input;
  if (!sex || !(heightCm > 0) || weight == null || !(weight > 0)) return null;
  const device = input.origin === 'device';

  const fat = input.fatMassKg ?? (input.bodyFatPercent != null ? (input.bodyFatPercent / 100) * weight : null);
  const fatPercent = input.bodyFatPercent ?? (fat != null ? (fat / weight) * 100 : null);
  const lean = input.leanMassKg ?? (fat != null ? weight - fat : null);
  const water = input.bodyWaterPercent != null ? (input.bodyWaterPercent / 100) * weight : null;
  const mineral = input.boneMassKg;
  const protein = lean != null && water != null && mineral != null ? Math.max(0, lean - water - mineral) : null;
  const muscle = input.muscleMassKg;
  const skeletal = input.skeletalMuscleMassKg;

  const h2 = (heightCm / 100) ** 2;
  const standardWeight = STANDARD_BMI[sex] * h2;
  const fatRange = FAT_RANGE_OF_STANDARD_WEIGHT[sex].map((f) => f * standardWeight) as [number, number];
  const standardFat = (fatRange[0] + fatRange[1]) / 2;
  const standardLean = standardWeight - standardFat;
  const [cLo, cHi] = COMPONENT_RANGE[sex];
  const componentRange = (share: number): [number, number] => [share * standardLean * cLo, share * standardLean * cHi];
  const skeletalRange = SKELETAL_RANGE_OF_STANDARD_LEAN[sex].map((f) => f * standardLean) as [number, number];
  const weightRange: [number, number] = [0.85 * standardWeight, 1.15 * standardWeight];

  const row = (label: string, valueKg: number | null, range: [number, number], aboveIsGood: boolean): RangeRow => ({
    label,
    valueKg: valueKg == null ? null : round1(valueKg),
    range: [round1(range[0]), round1(range[1])],
    percentOfWeight: valueKg == null ? null : round1((valueKg / weight) * 100),
    evaluation: valueKg == null ? null : rangeEvaluation(valueKg, range, aboveIsGood),
  });
  const composition: RangeRow[] = [
    row('Peso', weight, weightRange, false),
    row('Gordura corporal', fat, fatRange, false),
    row('Sal inorgânico', mineral, componentRange(0.067), true),
    row('Proteína', protein, componentRange(0.2), true),
    row('Água corporal', water, componentRange(0.733), true),
    row('Músculo', muscle, componentRange(0.933), true),
    row('Músculo esquelético', skeletal, skeletalRange, true),
  ];

  const bar = (
    label: string,
    value: number,
    unit: string,
    position: number,
    ticks: number[],
    healthy: [number, number],
    evaluation: Evaluation,
  ): Bar => ({ label, value: round1(value), unit, position: round1(position), ticks, healthy: [round1(healthy[0]), round1(healthy[1])], evaluation });

  const muscleFatBars: Bar[] = [
    bar('Peso', weight, ' kg', (weight / standardWeight) * 100, WEIGHT_TICKS, [85, 115], rangeEvaluation(weight, weightRange, false)),
  ];
  if (skeletal != null) {
    const standardSkeletal = (skeletalRange[0] + skeletalRange[1]) / 2;
    const healthy = skeletalRange.map((v) => (v / standardSkeletal) * 100) as [number, number];
    muscleFatBars.push(
      bar('Músculo esquelético', skeletal, ' kg', (skeletal / standardSkeletal) * 100, SKELETAL_TICKS, healthy, rangeEvaluation(skeletal, skeletalRange, true)),
    );
  }
  if (fat != null) {
    const healthy = fatRange.map((v) => (v / standardFat) * 100) as [number, number];
    muscleFatBars.push(bar('Massa gorda', fat, ' kg', (fat / standardFat) * 100, FAT_MASS_TICKS, healthy, rangeEvaluation(fat, fatRange, false)));
  }

  const bmi = weight / h2;
  const obesityBars: Bar[] = [bar('IMC', bmi, ' kg/m²', bmi, BMI_TICKS, [18.5, 25], rangeEvaluation(bmi, [18.5, 25], false))];
  if (fatPercent != null) {
    const healthy = HEALTHY_FAT_PERCENT[sex];
    obesityBars.push(bar('Taxa de gordura corporal', fatPercent, '%', fatPercent, FAT_PERCENT_TICKS[sex], healthy, rangeEvaluation(fatPercent, healthy, false)));
  }

  let muscleSegments: Segments | null = null;
  let armMuscle: number | null = null;
  let legMuscle: number | null = null;
  if (device && muscle != null) {
    const share = MUSCLE_SHARE[sex];
    const standardTotal =
      STANDARD_MUSCLE_TOTAL[sex].ofStandardWeight * standardWeight + STANDARD_MUSCLE_TOTAL[sex].ofExcessWeight * (weight - standardWeight);
    const stdShare = STANDARD_MUSCLE_SEGMENT_SHARE[sex];
    const segment = (label: string, kg: number, standard: number): SegmentRow => {
      const percent = (kg / standard) * 100;
      return { label, kg: round1(kg), percentOfStandard: round1(percent), evaluation: rangeEvaluation(percent, [90, 110], false) };
    };
    armMuscle = share.arm * muscle;
    legMuscle = share.leg * muscle;
    muscleSegments = {
      arm: segment('Cada braço', armMuscle, stdShare.arm * standardTotal),
      trunk: segment('Tronco', share.trunk * muscle, stdShare.trunk * standardTotal),
      leg: segment('Cada perna', legMuscle, stdShare.leg * standardTotal),
    };
  }

  let fatSegments: Segments | null = null;
  if (device && fat != null) {
    const std = STANDARD_FAT_SEGMENT_OF_STANDARD_WEIGHT[sex];
    const segment = (label: string, kg: number, standard: number): SegmentRow => {
      const percent = (kg / standard) * 100;
      return { label, kg: round1(kg), percentOfStandard: round1(percent), evaluation: rangeEvaluation(percent, [80, 160], false) };
    };
    fatSegments = {
      arm: segment('Cada braço', armFat(fat), std.arm * standardWeight),
      trunk: segment('Tronco', TRUNK_FAT_SHARE * fat, std.trunk * standardWeight),
      leg: segment('Cada perna', legFat(fat), std.leg * standardWeight),
    };
  }

  const kg = (v: number | null) => (v == null ? null : `${formatPlain(round1(v))} kg`);
  const others: Array<{ label: string; value: string | null }> = [
    { label: 'Grau de gordura visceral', value: input.visceralFatLevel == null ? null : formatPlain(input.visceralFatLevel) },
    { label: 'Taxa metabólica basal', value: input.basalMetabolicRateKcal == null ? null : `${formatPlain(input.basalMetabolicRateKcal)} kcal` },
    { label: 'Peso corporal livre de gordura', value: kg(lean) },
    { label: 'Gordura subcutânea', value: device && fatPercent != null ? `${formatPlain(round1(0.715 * fatPercent))} %` : null },
    {
      label: 'SMI (músculo de braços e pernas ÷ altura²)',
      value: armMuscle != null && legMuscle != null ? `${formatPlain(round1((2 * armMuscle + 2 * legMuscle) / h2))} kg/m²` : null,
    },
    { label: 'Idade do corpo', value: input.bodyAgeYears == null ? null : `${input.bodyAgeYears} anos` },
    { label: 'Relação cintura/quadril (fita métrica)', value: input.waistHipRatio == null ? null : formatPlain(input.waistHipRatio) },
  ];

  return {
    origin: input.origin,
    equipment: input.equipment,
    composition,
    muscleFatBars,
    obesityBars,
    fatSegments,
    muscleSegments,
    bodyType: fatPercent != null ? bodyType(bmi, fatPercent, sex) : null,
    others,
    impedance: device ? readImpedance(input.impedanceData) : null,
  };
}

// --- HTML ---------------------------------------------------------------------

const NOT_INFORMED = 'Não informado';
const EVAL_COLOR: Record<Evaluation, string> = { Baixo: '#b5651d', Saudável: '#1f7a5c', Alto: '#c2410c', Excelente: '#1f7a5c' };
const SEGMENT_FILL: Record<Evaluation, string> = { Baixo: '#f3d9b8', Saudável: '#cfe8db', Alto: '#f6c7a8', Excelente: '#cfe8db' };

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function evalCell(evaluation: Evaluation | null): string {
  if (!evaluation) return `<td class="r muted">—</td>`;
  return `<td class="r" style="color:${EVAL_COLOR[evaluation]};font-weight:700;">${evaluation}</td>`;
}

function compositionTable(rows: RangeRow[]): string {
  const body = rows
    .map((r) => {
      const value =
        r.valueKg == null
          ? `<span class="muted">${NOT_INFORMED}</span>`
          : `<b>${formatPlain(r.valueKg)}</b> <span class="range">(${formatPlain(r.range[0])}–${formatPlain(r.range[1])})</span>`;
      return `<tr><td>${r.label}</td><td class="r">${value}</td><td class="r">${r.percentOfWeight == null ? '—' : formatPlain(r.percentOfWeight)}</td>${evalCell(r.evaluation)}</tr>`;
    })
    .join('');
  return `<table class="bio-table"><thead><tr><th></th><th class="r">Medição (kg) e faixa normal</th><th class="r">% do peso</th><th class="r">Avaliação</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Posição (0–100%) na escala de marcas igualmente espaçadas, como no relatório da balança. */
function scalePosition(value: number, ticks: number[]): number {
  const last = ticks.length - 1;
  if (value <= ticks[0]) return 0;
  if (value >= ticks[last]) return 100;
  for (let i = 0; i < last; i += 1) {
    if (value <= ticks[i + 1]) return ((i + (value - ticks[i]) / (ticks[i + 1] - ticks[i])) / last) * 100;
  }
  return 100;
}

function barRow(b: Bar): string {
  const lo = scalePosition(b.healthy[0], b.ticks);
  const hi = scalePosition(b.healthy[1], b.ticks);
  const pos = scalePosition(b.position, b.ticks);
  const tickLabels = b.ticks
    .map((t, i) => `<span style="position:absolute;left:${(i / (b.ticks.length - 1)) * 100}%;transform:translateX(-50%);">${formatPlain(t)}</span>`)
    .join('');
  return `<tr>
    <td style="width:20%;">${b.label}</td>
    <td style="width:62%;padding-right:18px;">
      <div style="position:relative;height:9px;font-size:7px;color:#8b988e;margin-bottom:2px;">${tickLabels}</div>
      <div style="position:relative;height:12px;border-radius:6px;background:#f3ede4;overflow:hidden;">
        <div style="position:absolute;left:${lo}%;width:${hi - lo}%;top:0;bottom:0;background:#cfe8db;"></div>
        <div style="position:absolute;left:0;width:${pos}%;top:3px;height:6px;border-radius:3px;background:#123c2e;"></div>
      </div>
    </td>
    <td class="r"><b>${formatPlain(b.value)}${b.unit}</b></td>
    ${evalCell(b.evaluation)}
  </tr>`;
}

function barTable(bars: Bar[]): string {
  return `<table class="bio-table bars"><thead><tr><th></th><th>
    <div style="display:flex;font-size:8px;"><span style="flex:1;">Baixo</span><span style="flex:1;text-align:center;">Saudável</span><span style="flex:1;text-align:right;">Alto</span></div>
  </th><th class="r">Resultado</th><th class="r">Avaliação</th></tr></thead><tbody>${bars.map(barRow).join('')}</tbody></table>`;
}

/** Silhueta com braços, tronco e pernas pintados pela avaliação de cada parte. */
function bodyFigure(segments: Segments, title: string, note: string): string {
  const fill = (s: SegmentRow) => SEGMENT_FILL[s.evaluation];
  const label = (s: SegmentRow, name: string, style: string) =>
    `<div class="seg-label" style="${style}"><div class="seg-name">${name}</div><div class="seg-kg">${formatPlain(s.kg)} kg</div><div>${formatPlain(s.percentOfStandard)} % do padrão</div><div style="color:${EVAL_COLOR[s.evaluation]};font-weight:700;">${s.evaluation}</div></div>`;
  return `<div class="seg-card">
    <h3 class="seg-title">${title}</h3>
    <div class="seg-body">
      ${label(segments.arm, 'Cada braço', 'top:6px;left:0;')}
      ${label(segments.trunk, 'Tronco', 'top:84px;left:0;')}
      ${label(segments.leg, 'Cada perna', 'top:162px;left:0;')}
      ${label(segments.arm, 'Cada braço', 'top:6px;right:0;text-align:right;')}
      ${label(segments.leg, 'Cada perna', 'top:162px;right:0;text-align:right;')}
      <svg viewBox="0 0 120 230" class="seg-svg" aria-hidden="true">
        <circle cx="60" cy="20" r="13" fill="#e9eee8" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="55" y="32" width="10" height="7" fill="#e9eee8" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="38" y="38" width="44" height="72" rx="11" fill="${fill(segments.trunk)}" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="21" y="42" width="14" height="70" rx="7" transform="rotate(8 28 42)" fill="${fill(segments.arm)}" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="85" y="42" width="14" height="70" rx="7" transform="rotate(-8 92 42)" fill="${fill(segments.arm)}" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="40" y="112" width="18" height="108" rx="8" fill="${fill(segments.leg)}" stroke="#123c2e" stroke-width="1.2"/>
        <rect x="62" y="112" width="18" height="108" rx="8" fill="${fill(segments.leg)}" stroke="#123c2e" stroke-width="1.2"/>
      </svg>
    </div>
    <div class="seg-note">${note}</div>
  </div>`;
}

function othersTable(others: BioimpedanceAnalysis['others']): string {
  const body = others
    .map((o) => `<tr><td>${o.label}</td><td class="r">${o.value == null ? `<span class="muted">${NOT_INFORMED}</span>` : `<b>${o.value}</b>`}</td></tr>`)
    .join('');
  return `<table class="bio-table"><tbody>${body}</tbody></table>`;
}

function impedanceTable(impedance: NonNullable<BioimpedanceAnalysis['impedance']>): string {
  // Os dois braços e as duas pernas lado a lado, sem dizer qual é o direito: a ordem que a
  // balança manda ainda não foi confirmada contra o relatório do fabricante.
  const pair = ([a, b]: [number, number]) => `${formatPlain(round1(a))} · ${formatPlain(round1(b))}`;
  const cells = (z: SegmentImpedances) => [pair(z.arms), formatPlain(round1(z.trunk)), pair(z.legs)].map((v) => `<td class="r">${v}</td>`).join('');
  return `<table class="bio-table"><thead><tr><th>Z (Ω)</th><th class="r">Braços</th><th class="r">Tronco</th><th class="r">Pernas</th></tr></thead>
  <tbody><tr><td>20 kHz</td>${cells(impedance.khz20)}</tr><tr><td>100 kHz</td>${cells(impedance.khz100)}</tr></tbody></table>`;
}

const BIO_CSS = `
  .bio-page h2.section-title { margin: 8px 0 4px; font-size: 12px; }
  .bio-origin { font-size: 9px; color: #54635a; background: #f6f8f5; border: 1px solid #dde4dc; border-radius: 6px; padding: 5px 8px; margin-bottom: 4px; }
  table.bio-table { width: 100%; border-collapse: collapse; border: 1px solid #dde4dc; }
  table.bio-table th { background: #123c2e; color: #fff; font-weight: 600; font-size: 8.5px; text-align: left; padding: 4px 6px; }
  table.bio-table td { padding: 3px 6px; border-bottom: 1px solid #eef2ec; font-size: 9.5px; vertical-align: middle; }
  table.bio-table tr:last-child td { border-bottom: none; }
  table.bio-table .r { text-align: right; white-space: nowrap; }
  table.bio-table b { color: #123c2e; }
  .bio-page .muted { color: #8b988e; font-weight: 400; }
  .bio-page .range { font-size: 7.5px; color: #8b988e; }
  .bio-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .seg-card { border: 1px solid #dde4dc; border-radius: 6px; padding: 6px 8px; }
  .seg-title { font-size: 11px; color: #123c2e; margin: 0 0 4px; }
  .seg-body { position: relative; height: 236px; }
  .seg-svg { position: absolute; left: 50%; top: 0; width: 104px; height: 200px; transform: translateX(-50%); }
  .seg-label { position: absolute; width: 33%; font-size: 8px; color: #54635a; line-height: 1.3; }
  .seg-name { font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #8b988e; }
  .seg-kg { font-size: 11.5px; font-weight: 700; color: #123c2e; }
  .seg-note { font-size: 7.5px; color: #8b988e; }
  .body-type { font-size: 13px; font-weight: 700; color: #123c2e; }
`;

export function renderBioimpedancePages(analysis: BioimpedanceAnalysis, evaluatedAtLabel: string): string {
  const originLine =
    analysis.origin === 'device'
      ? `Medido pela balança de bioimpedância conectada ao painel${analysis.equipment ? ` (${escapeHtml(analysis.equipment)})` : ''} em ${evaluatedAtLabel}.`
      : `Valores de bioimpedância registrados na avaliação de ${evaluatedAtLabel}${analysis.equipment ? ` (aparelho: ${escapeHtml(analysis.equipment)})` : ''}.`;
  const pageOne = `
  <div class="page-break bio-page">
    <h1 class="page-title">Bioimpedância</h1>
    <div class="bio-origin">${originLine} Esta seção mostra só o que a bioimpedância mediu, separado dos outros métodos da avaliação (a fita métrica aparece só onde indicado).</div>
    <h2 class="section-title">Análise da composição corporal</h2>
    ${compositionTable(analysis.composition)}
    <h2 class="section-title">Análise de gordura muscular</h2>
    <div class="range">Barras em % do valor padrão para a altura e o sexo.</div>
    ${barTable(analysis.muscleFatBars)}
    <h2 class="section-title">Análise de obesidade</h2>
    ${barTable(analysis.obesityBars)}
    <div class="bio-two">
      <div>
        <h2 class="section-title">Outros indicadores</h2>
        ${othersTable(analysis.others)}
      </div>
      <div>
        <h2 class="section-title">Tipo de corpo</h2>
        <div class="seg-card"><div class="range">Pelo IMC e pelo % de gordura da bioimpedância</div><div class="body-type">${analysis.bodyType ?? `<span class="muted">${NOT_INFORMED}</span>`}</div></div>
      </div>
    </div>
  </div>`;

  const hasSegments = analysis.fatSegments || analysis.muscleSegments || analysis.impedance;
  const pageTwo = hasSegments
    ? `
  <div class="page-break bio-page">
    <h1 class="page-title">Bioimpedância — por parte do corpo</h1>
    <div class="bio-two">
      ${analysis.fatSegments ? bodyFigure(analysis.fatSegments, 'Análise segmentar de gordura', 'Faixa normal: 80% a 160% do padrão. Divisão por parte do corpo estimada, como no relatório da balança.') : ''}
      ${analysis.muscleSegments ? bodyFigure(analysis.muscleSegments, 'Equilíbrio muscular', 'Faixa normal: 90% a 110% do padrão. Divisão por parte do corpo estimada, como no relatório da balança.') : ''}
    </div>
    ${analysis.impedance ? `<h2 class="section-title">Impedância bioelétrica</h2>${impedanceTable(analysis.impedance)}` : ''}
  </div>`
    : '';

  return `<style>${BIO_CSS}</style>${pageOne}${pageTwo}`;
}
