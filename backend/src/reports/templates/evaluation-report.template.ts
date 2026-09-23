import { REPORT_CSS } from './report-styles';
import { formatShortDate, renderMetricChart, renderPieChartSvg } from './report-charts';
import type {
  ClientEvaluationReportData,
  EvaluationReportCore,
  ProfessionalEvaluationReportData,
  ReportMeasurements,
  ReportSeriesPoint,
} from './report-types';

/**
 * Nomes/notas vêm do banco (dados do usuário) — escapar sempre antes de
 * colocar no HTML que o Puppeteer renderiza, para nunca deixar uma string
 * como "<script>" virar HTML/JS ativo na página impressa.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function num(value: number | null, unit = ''): string {
  return value == null ? '—' : `${value}${unit}`;
}

function signed(value: number | null, unit = ''): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${unit}`;
}

function sexLabel(sex: 'male' | 'female' | null): string {
  if (sex === 'male') return 'Masculino';
  if (sex === 'female') return 'Feminino';
  return '—';
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

/** Soma das variações de um grupo de medidas (ex.: tórax+cintura+abdômen+quadril) — não inventa uma "média", soma exatamente o que mudou em cada uma. */
function sumDelta(
  previous: Partial<ReportMeasurements>,
  current: Partial<ReportMeasurements>,
  keys: Array<keyof ReportMeasurements>,
): number | null {
  const deltas = keys
    .map((k) => {
      const a = previous[k];
      const b = current[k];
      return a == null || b == null ? null : b - a;
    })
    .filter((v): v is number => v != null);
  if (!deltas.length) return null;
  return Math.round(deltas.reduce((s, v) => s + v, 0) * 100) / 100;
}

const TRUNK_KEYS: Array<keyof ReportMeasurements> = ['chestCm', 'waistCm', 'abdomenCm', 'hipCm'];
const LIMB_KEYS: Array<keyof ReportMeasurements> = [
  'armRightCm',
  'armLeftCm',
  'forearmRightCm',
  'forearmLeftCm',
  'thighRightCm',
  'thighLeftCm',
  'calfRightCm',
  'calfLeftCm',
];

// --- Cabeçalho e identificação (compartilhado pelas duas audiências) ------

function headerBlock(kindLabel: string, professionalName: string, generatedAt: string): string {
  return `
  <header class="report-header">
    <div>
      <div class="brand">Bocado de Nutrição</div>
      <div class="kind">${escapeHtml(kindLabel)}</div>
    </div>
    <div class="meta">
      Gerado em ${formatDate(generatedAt)}<br>
      Profissional: ${escapeHtml(professionalName)}
    </div>
  </header>`;
}

function identityGrid(core: EvaluationReportCore, protocolMethodLabel: string | null): string {
  const protocolLine = protocolMethodLabel
    ? `<div class="tile"><div class="label">Método de avaliação</div><div class="value">${escapeHtml(protocolMethodLabel)}</div></div>`
    : '';
  return `
  <div class="identity-grid">
    <div class="tile"><div class="label">Cliente</div><div class="value">${escapeHtml(core.clientName)}</div></div>
    <div class="tile"><div class="label">Sexo</div><div class="value">${sexLabel(core.biologicalSexForCalculation)}</div></div>
    <div class="tile"><div class="label">Idade / Altura</div><div class="value">${core.ageAtEvaluation ?? '—'} anos · ${core.heightCm} cm</div></div>
    <div class="tile"><div class="label">Data da avaliação</div><div class="value">${formatDate(core.evaluatedAt)}</div></div>
    ${protocolLine}
  </div>`;
}

// --- 1. Resumo das avaliações ---------------------------------------------

function formatDuration(days: number): string {
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  if (months <= 0) return `${remDays}d`;
  return `${months}m ${remDays}d`;
}

interface ResumoPeriod {
  label: string;
  comparison: ReportComparisonLike;
  measurementsDelta: { trunkCm: number | null; limbsCm: number | null } | null;
  currentEvaluatedAt: string;
}

// Estrutura mínima que resumoSection precisa de um ReportComparison — evita importar o tipo completo aqui.
interface ReportComparisonLike {
  previousEvaluatedAt: string | null;
  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  muscleMassKg: number | null;
  musclePercent: number | null;
  skeletalMuscleMassKg: number | null;
  skeletalMusclePercent: number | null;
}

function resumoPeriodRow(period: ResumoPeriod): string {
  const c = period.comparison;
  const days = c.previousEvaluatedAt ? daysBetween(c.previousEvaluatedAt, period.currentEvaluatedAt) : null;
  return `
    <tr>
      <td>Tempo</td>
      <td class="num">${days != null ? formatDuration(days) : '—'}</td>
    </tr>
    <tr><td>Peso</td><td class="num">${signed(c.weightKg, ' kg')}</td></tr>
    <tr><td>Gordura</td><td class="num">${signed(c.bodyFatPercent, '%')} (${signed(c.fatMassKg, 'kg')})</td></tr>
    <tr><td>Músculo esquelético</td><td class="num">${signed(c.skeletalMusclePercent, '%')} (${signed(c.skeletalMuscleMassKg, 'kg')})</td></tr>
    <tr><td>Massa muscular</td><td class="num">${signed(c.musclePercent, '%')} (${signed(c.muscleMassKg, 'kg')})</td></tr>
    <tr><td>Medidas tronco</td><td class="num">${signed(period.measurementsDelta?.trunkCm ?? null, ' cm')}</td></tr>
    <tr><td>Medidas membros</td><td class="num">${signed(period.measurementsDelta?.limbsCm ?? null, ' cm')}</td></tr>`;
}

/**
 * Sem histórico algum: mostra só que é a primeira avaliação, sem inventar
 * comparação nenhuma. Com 1 período (cliente, ou profissional com só uma
 * avaliação anterior): tabela de 2 colunas (Indicador/Variação). Com 2
 * períodos (profissional com 3+ avaliações): "Último" (desde a anterior) e
 * "Geral" (desde a primeira já registrada), lado a lado — como no relatório
 * de referência.
 */
function resumoSection(core: EvaluationReportCore, last: ResumoPeriod | null, overall: ResumoPeriod | null): string {
  if (!last) {
    return `<h2 class="section-title">Resumo das avaliações</h2>
      <div class="comparison-empty">Esta é a primeira avaliação registrada — ainda não há histórico para comparar.</div>`;
  }
  if (!overall) {
    return `
      <h2 class="section-title">Resumo das avaliações</h2>
      <table class="data-table"><thead><tr><th>Indicador</th><th class="num">Desde a avaliação anterior</th></tr></thead>
      <tbody>${resumoPeriodRow(last)}</tbody></table>`;
  }
  return `
    <h2 class="section-title">Resumo das avaliações</h2>
    <table class="data-table">
      <thead><tr><th>Indicador</th><th class="num">Último</th><th class="num">Geral</th></tr></thead>
      <tbody>
        <tr><td>Tempo</td>
          <td class="num">${last.comparison.previousEvaluatedAt ? formatDuration(daysBetween(last.comparison.previousEvaluatedAt, core.evaluatedAt)) : '—'}</td>
          <td class="num">${overall.comparison.previousEvaluatedAt ? formatDuration(daysBetween(overall.comparison.previousEvaluatedAt, core.evaluatedAt)) : '—'}</td>
        </tr>
        <tr><td>Peso</td><td class="num">${signed(last.comparison.weightKg, ' kg')}</td><td class="num">${signed(overall.comparison.weightKg, ' kg')}</td></tr>
        <tr><td>Gordura</td>
          <td class="num">${signed(last.comparison.bodyFatPercent, '%')} (${signed(last.comparison.fatMassKg, 'kg')})</td>
          <td class="num">${signed(overall.comparison.bodyFatPercent, '%')} (${signed(overall.comparison.fatMassKg, 'kg')})</td>
        </tr>
        <tr><td>Músculo esquelético</td>
          <td class="num">${signed(last.comparison.skeletalMusclePercent, '%')} (${signed(last.comparison.skeletalMuscleMassKg, 'kg')})</td>
          <td class="num">${signed(overall.comparison.skeletalMusclePercent, '%')} (${signed(overall.comparison.skeletalMuscleMassKg, 'kg')})</td>
        </tr>
        <tr><td>Massa muscular</td>
          <td class="num">${signed(last.comparison.musclePercent, '%')} (${signed(last.comparison.muscleMassKg, 'kg')})</td>
          <td class="num">${signed(overall.comparison.musclePercent, '%')} (${signed(overall.comparison.muscleMassKg, 'kg')})</td>
        </tr>
        <tr><td>Medidas tronco</td>
          <td class="num">${signed(last.measurementsDelta?.trunkCm ?? null, ' cm')}</td>
          <td class="num">${signed(overall.measurementsDelta?.trunkCm ?? null, ' cm')}</td>
        </tr>
        <tr><td>Medidas membros</td>
          <td class="num">${signed(last.measurementsDelta?.limbsCm ?? null, ' cm')}</td>
          <td class="num">${signed(overall.measurementsDelta?.limbsCm ?? null, ' cm')}</td>
        </tr>
      </tbody>
    </table>`;
}

// --- 2. Composição corporal -------------------------------------------------

interface MetricRow {
  label: string;
  value: string;
  /** Só preenchido quando há regra de classificação de verdade implementada (hoje: só IMC) — nunca inventado. */
  classification: string | null;
}

function metricTableHtml(rows: MetricRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.value}</td><td class="eval">${r.classification ? escapeHtml(r.classification) : '—'}</td></tr>`,
    )
    .join('');
  return `<table class="metric-table"><thead><tr><th>Descrição</th><th class="num">Resultado</th><th class="eval">Avaliação</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Duas tabelas lado a lado (Descrição/Resultado/Avaliação), como no relatório de referência — "Avaliação" só vem preenchida onde já existe regra de classificação real (hoje, só IMC). */
function compositionTables(core: EvaluationReportCore): string {
  const left: MetricRow[] = [
    { label: 'Peso', value: num(core.weightKg, ' kg'), classification: null },
    { label: 'Músculo esquelético', value: num(core.composition?.skeletalMuscleMassKg ?? null, ' kg'), classification: null },
    { label: 'Massa muscular', value: num(core.composition?.muscleMassKg ?? null, ' kg'), classification: null },
    { label: 'Água corporal', value: num(core.composition?.bodyWaterPercent ?? null, '%'), classification: null },
    { label: 'Massa óssea', value: num(core.composition?.boneMassKg ?? null, ' kg'), classification: null },
    { label: 'Idade corporal', value: num(core.composition?.bodyAgeYears ?? null, ' anos'), classification: null },
  ];
  const right: MetricRow[] = [
    { label: 'IMC', value: core.bmi != null ? String(core.bmi) : '—', classification: core.bmiClassification },
    { label: 'Gordura corporal', value: num(core.bodyFatPercent, '%'), classification: null },
    { label: 'Gordura visceral', value: num(core.composition?.visceralFatLevel ?? null, ''), classification: null },
    { label: 'Metabolismo basal', value: num(core.composition?.basalMetabolicRateKcal ?? null, ' kcal'), classification: null },
    { label: 'Relação cintura/quadril', value: num(core.waistHipRatio, ''), classification: null },
  ];
  return `<h2 class="section-title">Composição corporal</h2><div class="composition-tables">${metricTableHtml(left)}${metricTableHtml(right)}</div>`;
}

/** "Outros indicadores" da referência — só sinais vitais liberados pro profissional; "Avaliação" fica vazia (sem regra de classificação implementada). */
function outrosIndicadoresTable(data: ProfessionalEvaluationReportData): string {
  const rows: MetricRow[] = [];
  if (data.bloodPressureSystolic != null || data.bloodPressureDiastolic != null) {
    rows.push({ label: 'Pressão arterial', value: `${data.bloodPressureSystolic ?? '—'}/${data.bloodPressureDiastolic ?? '—'} mmHg`, classification: null });
  }
  if (data.heartRate != null) rows.push({ label: 'Frequência cardíaca', value: num(data.heartRate, ' bpm'), classification: null });
  if (data.glucose != null) rows.push({ label: 'Glicemia', value: num(data.glucose, ' mg/dL'), classification: null });
  if (!rows.length) return '';
  return `<h2 class="section-title">Outros indicadores</h2>${metricTableHtml(rows)}`;
}

const MEASUREMENT_LABELS: Record<keyof ReportMeasurements, string> = {
  chestCm: 'Tórax',
  waistCm: 'Cintura',
  abdomenCm: 'Abdômen',
  hipCm: 'Quadril',
  armRightCm: 'Braço dir.',
  armLeftCm: 'Braço esq.',
  forearmRightCm: 'Antebraço dir.',
  forearmLeftCm: 'Antebraço esq.',
  thighRightCm: 'Coxa dir.',
  thighLeftCm: 'Coxa esq.',
  calfRightCm: 'Panturrilha dir.',
  calfLeftCm: 'Panturrilha esq.',
  wristCm: 'Punho',
  femurBicondylarCm: 'Fêmur (bicondilar)',
};

/** Circunferências atuais, resumidas — mostradas na página 1 pras duas audiências; a evolução detalhada por grupo fica na página 3 (só profissional). */
function measurementsGrid(measurements: ReportMeasurements | null): string {
  if (!measurements) return '';
  const tiles = (Object.keys(MEASUREMENT_LABELS) as Array<keyof ReportMeasurements>)
    .filter((key) => measurements[key] != null)
    .map((key) => `<div class="tile"><div class="label">${MEASUREMENT_LABELS[key]}</div><div class="value">${num(measurements[key], ' cm')}</div></div>`)
    .join('');
  if (!tiles) return '';
  return `<h2 class="section-title">Circunferências</h2><div class="measure-grid">${tiles}</div>`;
}

// --- Página 1 (compartilhada: cabeçalho + identificação + resumo + composição) ---

function pageOne(
  kindLabel: string,
  core: EvaluationReportCore,
  generatedAt: string,
  protocolMethodLabel: string | null,
  last: ResumoPeriod | null,
  overall: ResumoPeriod | null,
  // No relatório profissional, as circunferências já aparecem com muito mais
  // detalhe (atual/anterior/variação) na página 3 — repeti-las aqui só
  // ocuparia espaço e ainda estourava a página 1. No relatório cliente, que
  // não tem página 3, esta é a única vez que elas aparecem.
  includeMeasurementsGrid: boolean,
  extraBody: string,
): string {
  return `
  ${headerBlock(kindLabel, core.professionalName, generatedAt)}
  <h1 class="page-title">Avaliação / Controle Corporal</h1>
  ${identityGrid(core, protocolMethodLabel)}
  ${resumoSection(core, last, overall)}
  ${compositionTables(core)}
  ${includeMeasurementsGrid ? measurementsGrid(core.measurements) : ''}
  ${extraBody}`;
}

// --- Página 2 — gráficos de evolução (só profissional) ---------------------

const CHART_GREEN = '#1f7a5c';
const CHART_AMBER = '#b5651d';

function muscleMassPercent(point: ReportSeriesPoint): number | null {
  if (point.muscleMassKg == null || point.weightKg == null || point.weightKg === 0) return null;
  return Math.round((point.muscleMassKg / point.weightKg) * 1000) / 10;
}

const PIE_GORDURA = '#d9a441';
const PIE_MAGRA = '#1f7a5c';
const PIE_MUSCULO = '#1f7a5c';
const PIE_OSSEA = '#8fc9a8';
const PIE_RESIDUAL = '#6fa8c9';

/** Pizza "bi-compartimental": massa gorda × massa magra (%), instantâneo da avaliação atual. */
function biCompartimentalPie(core: EvaluationReportCore): string {
  if (core.bodyFatPercent == null) {
    return `<div class="chart-card"><h3 class="chart-title">Composição corporal — Bi-compartimental</h3><div class="chart-empty">Sem % de gordura calculado nesta avaliação.</div></div>`;
  }
  const gordura = core.bodyFatPercent;
  const magra = Math.max(0, 100 - gordura);
  const svg = renderPieChartSvg([
    { label: 'Massa gorda', color: PIE_GORDURA, value: gordura },
    { label: 'Massa magra', color: PIE_MAGRA, value: magra },
  ]);
  return `<div class="chart-card"><h3 class="chart-title">Composição corporal — Bi-compartimental</h3>${svg}</div>`;
}

/** Pizza "tetra-compartimental": gordura, músculo esquelético, massa óssea e o restante (massa residual), como % do peso — tudo derivado de valores reais já registrados. */
function tetraCompartimentalPie(core: EvaluationReportCore): string {
  const weight = core.weightKg;
  const gordura = core.bodyFatPercent;
  if (weight == null || gordura == null) {
    return `<div class="chart-card"><h3 class="chart-title">Composição corporal — Tetra-compartimental</h3><div class="chart-empty">Sem dados suficientes para este gráfico.</div></div>`;
  }
  const musculo = percentOf(core.composition?.skeletalMuscleMassKg ?? null, weight) ?? 0;
  const ossea = percentOf(core.composition?.boneMassKg ?? null, weight) ?? 0;
  const residual = Math.max(0, 100 - gordura - musculo - ossea);
  const svg = renderPieChartSvg([
    { label: 'Massa gorda', color: PIE_GORDURA, value: gordura },
    { label: 'Músculo esq.', color: PIE_MUSCULO, value: musculo },
    { label: 'Massa óssea', color: PIE_OSSEA, value: ossea },
    { label: 'Massa residual (órgãos internos)', color: PIE_RESIDUAL, value: residual },
  ]);
  return `<div class="chart-card"><h3 class="chart-title">Composição corporal — Tetra-compartimental</h3>${svg}</div>`;
}

function percentOf(massKg: number | null, weightKg: number | null): number | null {
  if (massKg == null || weightKg == null || weightKg === 0) return null;
  return Math.round((massKg / weightKg) * 1000) / 10;
}

function evolutionChartsPage(data: ProfessionalEvaluationReportData): string {
  const series = data.series;
  const labels = series.map((p) => formatShortDate(p.evaluatedAt));

  const weightChart = renderMetricChart('Peso corporal', labels, [{ label: 'Peso', unit: 'kg', color: CHART_GREEN, values: series.map((p) => p.weightKg) }]);

  const percentChart = renderMetricChart('Músculo e gordura em percentual', labels, [
    { label: '% Gordura corporal', unit: '%', color: CHART_AMBER, values: series.map((p) => p.bodyFatPercent) },
    { label: '% Massa muscular', unit: '%', color: CHART_GREEN, values: series.map(muscleMassPercent) },
  ]);

  const waterChart = renderMetricChart('Água corporal', labels, [{ label: 'Água corporal', unit: '%', color: CHART_GREEN, values: series.map((p) => p.bodyWaterPercent) }]);

  const ageChart = renderMetricChart('Idade corporal', labels, [
    { label: 'Idade real', unit: 'anos', color: CHART_GREEN, values: series.map((p) => p.ageAtEvaluation) },
    { label: 'Idade corporal', unit: 'anos', color: CHART_AMBER, values: series.map((p) => p.bodyAgeYears) },
  ]);

  return `
  <div class="page-break">
    <h1 class="page-title">Evolução gráfica</h1>
    <div class="chart-grid-page">
      <div class="full">${weightChart}</div>
      ${biCompartimentalPie(data)}
      ${tetraCompartimentalPie(data)}
      ${percentChart}
      ${waterChart}
      ${ageChart}
    </div>
  </div>`;
}

// --- Página 3 — medidas e dobras (só profissional) --------------------------

function measurementsTable(
  title: string,
  keys: Array<keyof ReportMeasurements>,
  current: ReportMeasurements | null,
  previous: ReportMeasurements | null,
): string {
  if (!current) return '';
  const rows = keys
    .filter((key) => current[key] != null)
    .map((key) => {
      const curVal = current[key];
      const prevVal = previous?.[key] ?? null;
      const delta = prevVal != null && curVal != null ? Math.round((curVal - prevVal) * 100) / 100 : null;
      const deltaCell =
        delta == null
          ? '<td class="num">—</td>'
          : `<td class="num ${delta < 0 ? 'delta-down' : delta > 0 ? 'delta-up' : ''}">${signed(delta, ' cm')}</td>`;
      return `<tr><td>${MEASUREMENT_LABELS[key]}</td><td class="num">${num(curVal, ' cm')}</td><td class="num">${num(prevVal, ' cm')}</td>${deltaCell}</tr>`;
    })
    .join('');
  if (!rows) return '';
  return `
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <table class="data-table">
      <thead><tr><th>Medida</th><th class="num">Atual</th><th class="num">Anterior</th><th class="num">Variação</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

const SKINFOLD_LABELS: Record<string, string> = {
  chestMm: 'Tórax',
  axillaryMidMm: 'Axilar média',
  subscapularMm: 'Subescapular',
  bicepsMm: 'Bíceps',
  tricepsMm: 'Tríceps',
  abdominalMm: 'Abdominal',
  suprailiacMm: 'Supra-ilíaca',
  thighMm: 'Coxa',
  calfMm: 'Panturrilha',
};

function skinfoldsSection(data: ProfessionalEvaluationReportData): string {
  const skinfolds = data.skinfolds;
  const rows = skinfolds
    ? Object.entries(skinfolds)
        .filter((entry): entry is [string, number] => entry[1] != null)
        .map(([k, v]) => `<tr><td>${SKINFOLD_LABELS[k] ?? escapeHtml(k)}</td><td class="num">${v} mm</td></tr>`)
        .join('')
    : '';

  if (!rows) {
    return `<h2 class="section-title">Dobras cutâneas</h2><div class="comparison-empty">Sem dobras registradas nesta avaliação.</div>`;
  }

  const evolutionNote = data.previous?.skinfolds
    ? '<div class="comparison-empty">Comparação individual disponível apenas quando o mesmo protocolo foi usado nas duas avaliações.</div>'
    : '';

  return `
    <h2 class="section-title">Dobras cutâneas</h2>
    <table class="data-table"><thead><tr><th>Local</th><th class="num">Medida</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:10px;color:#8b988e;">Protocolo: ${escapeHtml(data.protocolLabel ?? 'não informado')} · Fonte do %gordura: ${escapeHtml(data.bodyFatPercentSource ?? '—')}</div>
    ${evolutionNote}`;
}


/** Só sistólica/diastólica, numa linha — a página 1 já mostra os sinais vitais completos (freq. cardíaca, glicemia); repetir tudo aqui estouraria a página. */
function bloodPressureLine(data: ProfessionalEvaluationReportData): string {
  if (data.bloodPressureSystolic == null && data.bloodPressureDiastolic == null) {
    return `<h2 class="section-title">Pressão arterial</h2><div class="comparison-empty">Sem pressão arterial registrada nesta avaliação.</div>`;
  }
  const prev = data.previous;
  const prevText =
    prev && (prev.bloodPressureSystolic != null || prev.bloodPressureDiastolic != null)
      ? ` · anterior (${formatDate(prev.evaluatedAt)}): ${prev.bloodPressureSystolic ?? '—'}/${prev.bloodPressureDiastolic ?? '—'} mmHg`
      : '';
  return `<h2 class="section-title">Pressão arterial</h2><div class="comparison-row"><div>Atual: <b>${data.bloodPressureSystolic ?? '—'}/${data.bloodPressureDiastolic ?? '—'} mmHg</b>${prevText}</div></div>`;
}

function measurementsAndSkinfoldsPage(data: ProfessionalEvaluationReportData): string {
  const previousMeasurements: ReportMeasurements | null = data.previous?.measurements ?? null;
  const trunk = measurementsTable('Medidas do tronco', ['chestCm', 'waistCm', 'abdomenCm', 'hipCm'], data.measurements, previousMeasurements);
  const upper = measurementsTable(
    'Membros superiores',
    ['armRightCm', 'armLeftCm', 'forearmRightCm', 'forearmLeftCm'],
    data.measurements,
    previousMeasurements,
  );
  const lower = measurementsTable(
    'Membros inferiores',
    ['thighRightCm', 'thighLeftCm', 'calfRightCm', 'calfLeftCm'],
    data.measurements,
    previousMeasurements,
  );

  return `
  <div class="page-break">
    <h1 class="page-title">Medidas e dobras</h1>
    ${trunk || '<h2 class="section-title">Medidas do tronco</h2><div class="comparison-empty">Sem medidas de tronco registradas.</div>'}
    ${upper || '<h2 class="section-title">Membros superiores</h2><div class="comparison-empty">Sem medidas de membros superiores registradas.</div>'}
    ${lower || '<h2 class="section-title">Membros inferiores</h2><div class="comparison-empty">Sem medidas de membros inferiores registradas.</div>'}
    ${bloodPressureLine(data)}
    ${skinfoldsSection(data)}
  </div>`;
}

// --- Página 4 — fotos (só profissional) -------------------------------------

const PHOTO_ANGLE_LABELS: Record<string, string> = {
  front: 'Frente',
  side_right: 'Lado direito',
  back: 'Costas',
  side_left: 'Lado esquerdo',
};

function photosPage(data: ProfessionalEvaluationReportData): string {
  if (!data.photos.length) {
    // Sem fotos: nenhuma página é gerada (evita página em branco).
    return '';
  }
  const cols = Math.min(data.photos.length, 4);
  const figures = data.photos
    .map((p) => `<figure><img src="${p.dataUri}"><figcaption>${escapeHtml(PHOTO_ANGLE_LABELS[p.angle] ?? p.angle)}</figcaption></figure>`)
    .join('');
  return `
  <div class="page-break">
    <h1 class="page-title">Fotos</h1>
    <div class="photos-grid cols-${cols}">${figures}</div>
  </div>`;
}

// --- Composição final --------------------------------------------------------

function buildResumoPeriod(
  comparison: ProfessionalEvaluationReportData['comparison'],
  currentMeasurements: ReportMeasurements | null,
  previousMeasurements: ReportMeasurements | null,
  currentEvaluatedAt: string,
): ResumoPeriod | null {
  if (!comparison) return null;
  return {
    label: '',
    comparison,
    measurementsDelta: {
      trunkCm: sumDelta(previousMeasurements ?? {}, currentMeasurements ?? {}, TRUNK_KEYS),
      limbsCm: sumDelta(previousMeasurements ?? {}, currentMeasurements ?? {}, LIMB_KEYS),
    },
    currentEvaluatedAt,
  };
}

export function renderProfessionalReportHtml(data: ProfessionalEvaluationReportData): string {
  const last = buildResumoPeriod(data.comparison, data.measurements, data.previous?.measurements ?? null, data.evaluatedAt);
  const overall = buildResumoPeriod(data.overallComparison, data.measurements, data.first?.measurements ?? null, data.evaluatedAt);

  const page1Extra = outrosIndicadoresTable(data);
  const page1 = pageOne('Relatório profissional — uso interno', data, data.generatedAt, data.protocolLabel, last, overall, false, page1Extra);

  const notesBlock = data.notes ? `<h2 class="section-title">Notas internas</h2><div class="notes-box">${escapeHtml(data.notes)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${REPORT_CSS}</style></head>
<body>
  ${page1}
  ${notesBlock}
  ${evolutionChartsPage(data)}
  ${measurementsAndSkinfoldsPage(data)}
  ${photosPage(data)}
</body>
</html>`;
}

export function renderClientReportHtml(data: ClientEvaluationReportData): string {
  const last = buildResumoPeriod(data.comparison, data.measurements, null, data.evaluatedAt);
  const page1 = pageOne('Relatório de avaliação', data, data.generatedAt, null, last, null, true, '');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${REPORT_CSS}</style></head>
<body>
  ${page1}
</body>
</html>`;
}
