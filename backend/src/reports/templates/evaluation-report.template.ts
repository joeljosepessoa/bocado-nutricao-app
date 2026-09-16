import { REPORT_CSS } from './report-styles';
import type {
  ClientEvaluationReportData,
  EvaluationReportCore,
  ProfessionalEvaluationReportData,
  ReportComposition,
  ReportMeasurements,
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

function metricTiles(core: EvaluationReportCore): string {
  const tiles: Array<[string, string]> = [
    ['Peso', num(core.weightKg, ' kg')],
    ['IMC', core.bmi != null ? `${core.bmi} (${escapeHtml(core.bmiClassification ?? '')})` : '—'],
    ['% de gordura', num(core.bodyFatPercent, '%')],
    ['Massa gorda', num(core.fatMassKg, ' kg')],
    ['Massa magra', num(core.leanMassKg, ' kg')],
  ];
  return `<div class="metric-grid">${tiles
    .map(([label, value]) => `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join('')}</div>`;
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

function measurementsSection(measurements: ReportMeasurements | null): string {
  if (!measurements) {
    return '';
  }
  const tiles = (Object.keys(MEASUREMENT_LABELS) as Array<keyof ReportMeasurements>)
    .filter((key) => measurements[key] != null)
    .map((key) => `<div class="tile"><div class="label">${MEASUREMENT_LABELS[key]}</div><div class="value">${num(measurements[key], ' cm')}</div></div>`)
    .join('');
  if (!tiles) {
    return '';
  }
  return `<h2 class="section-title">Circunferências</h2><div class="measure-grid">${tiles}</div>`;
}

const COMPOSITION_LABELS: Record<keyof ReportComposition, [string, string]> = {
  muscleMassKg: ['Massa muscular', ' kg'],
  skeletalMuscleMassKg: ['Massa muscular esquelética', ' kg'],
  bodyWaterPercent: ['Água corporal', '%'],
  visceralFatLevel: ['Gordura visceral', ''],
  boneMassKg: ['Massa óssea', ' kg'],
  basalMetabolicRateKcal: ['Metabolismo basal', ' kcal'],
  bodyAgeYears: ['Idade corporal', ' anos'],
};

function compositionSection(composition: ReportComposition | null): string {
  if (!composition) {
    return '';
  }
  const tiles = (Object.keys(COMPOSITION_LABELS) as Array<keyof ReportComposition>)
    .filter((key) => composition[key] != null)
    .map((key) => {
      const [label, unit] = COMPOSITION_LABELS[key];
      return `<div class="tile"><div class="label">${label}</div><div class="value">${num(composition[key], unit)}</div></div>`;
    })
    .join('');
  if (!tiles) {
    return '';
  }
  return `<h2 class="section-title">Composição corporal (bioimpedância)</h2><div class="comp-grid">${tiles}</div>`;
}

function comparisonSection(core: EvaluationReportCore): string {
  if (!core.comparison) {
    return '';
  }
  const c = core.comparison;
  const row = (label: string, value: number | null, unit: string) => {
    if (value == null) return '';
    const sign = value > 0 ? '+' : '';
    return `<div>${label}: <b>${sign}${value}${unit}</b></div>`;
  };
  return `
    <h2 class="section-title">Evolução desde a avaliação anterior (${formatDate(c.previousEvaluatedAt ?? '')})</h2>
    <div class="comparison-row">
      ${row('Peso', c.weightKg, ' kg')}
      ${row('% de gordura', c.bodyFatPercent, '%')}
      ${row('Massa magra', c.leanMassKg, ' kg')}
      ${row('Massa gorda', c.fatMassKg, ' kg')}
    </div>`;
}

function documentShell(kindLabel: string, core: EvaluationReportCore, generatedAt: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${REPORT_CSS}</style></head>
<body>
  <header class="report-header">
    <div>
      <div class="brand">Bocado de Nutrição</div>
      <div class="kind">${kindLabel}</div>
    </div>
    <div class="meta">
      Gerado em ${formatDate(generatedAt)}<br>
      Profissional: ${escapeHtml(core.professionalName)}
    </div>
  </header>

  <div class="identity-grid">
    <div class="tile"><div class="label">Cliente</div><div class="value">${escapeHtml(core.clientName)}</div></div>
    <div class="tile"><div class="label">Data da avaliação</div><div class="value">${formatDate(core.evaluatedAt)}</div></div>
    <div class="tile"><div class="label">Idade / Altura</div><div class="value">${core.ageAtEvaluation ?? '—'} anos · ${core.heightCm} cm</div></div>
  </div>

  <h2 class="section-title">Composição corporal</h2>
  ${metricTiles(core)}

  ${measurementsSection(core.measurements)}
  ${compositionSection(core.composition)}
  ${comparisonSection(core)}

  ${body}

  <footer class="report-footer">
    <span>Bocado de Nutrição — relatório gerado automaticamente</span>
    <span>${kindLabel}</span>
  </footer>
</body>
</html>`;
}

export function renderProfessionalReportHtml(data: ProfessionalEvaluationReportData): string {
  const skinfoldsRows = data.skinfolds
    ? Object.entries(data.skinfolds)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v} mm</td></tr>`)
        .join('')
    : '';

  const photosSection = data.photos.length
    ? `<h2 class="section-title">Fotos</h2><div class="photos-grid">${data.photos
        .map((p) => `<figure><img src="${p.dataUri}"><figcaption>${escapeHtml(p.angle)}</figcaption></figure>`)
        .join('')}</div>`
    : '';

  const body = `
    <h2 class="section-title">Dobras cutâneas</h2>
    ${
      skinfoldsRows
        ? `<table class="data-table"><thead><tr><th>Local</th><th>Medida</th></tr></thead><tbody>${skinfoldsRows}</tbody></table>
           <div style="font-size:10px;color:#8b988e;">Protocolo: ${escapeHtml(data.protocolLabel ?? 'não informado')} · Fonte do %gordura: ${escapeHtml(data.bodyFatPercentSource ?? '—')}</div>`
        : '<div style="font-size:10.5px;color:#8b988e;">Sem dobras registradas nesta avaliação.</div>'
    }

    <h2 class="section-title">Bioimpedância — origem</h2>
    <div style="font-size:10.5px;">${data.composition ? escapeHtml(data.bioimpedanceOrigin === 'device_confirmed' ? 'Balança conectada' : 'Manual') : 'Sem bioimpedância registrada nesta avaliação.'}</div>

    <h2 class="section-title">Sinais vitais</h2>
    <div class="metric-grid">
      <div class="tile"><div class="label">Pressão arterial</div><div class="value">${data.bloodPressureSystolic ?? '—'}/${data.bloodPressureDiastolic ?? '—'}</div></div>
      <div class="tile"><div class="label">Freq. cardíaca</div><div class="value">${num(data.heartRate, ' bpm')}</div></div>
      <div class="tile"><div class="label">Glicemia</div><div class="value">${num(data.glucose, ' mg/dL')}</div></div>
    </div>

    ${data.notes ? `<h2 class="section-title">Notas internas</h2><div class="notes-box">${escapeHtml(data.notes)}</div>` : ''}
    ${photosSection}
  `;

  return documentShell('Relatório profissional — uso interno', data, data.generatedAt, body);
}

export function renderClientReportHtml(data: ClientEvaluationReportData): string {
  return documentShell('Relatório de avaliação', data, data.generatedAt, '');
}
