/**
 * Gráficos de evolução do relatório em PDF — SVG gerado no servidor (string
 * pura, sem canvas/JS no navegador) porque o Puppeteer já rasteriza SVG
 * perfeitamente ao imprimir, e uma string é testável com asserts simples
 * (mesmo padrão dos outros arquivos deste template). Sem dependência nova:
 * mesma filosofia do gráfico artesanal em mobile/src/components/EvolutionChart.tsx,
 * só que gerado em Node em vez de react-native-svg.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatChartNumber(value: number): string {
  // até 1 casa decimal, sem casas quando o valor já é inteiro — rótulo de eixo legível
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface ChartSeriesInput {
  label: string;
  color: string;
  unit: string;
  values: Array<number | null>;
}

export interface LineChartOptions {
  labels: string[];
  series: ChartSeriesInput[];
  width?: number;
  height?: number;
}

/**
 * Gráfico de linha com 1+ séries. Quebra o traçado em `null` (não interpola
 * dado ausente). Precisa de pelo menos 2 pontos com valor em alguma série —
 * chamadores devem usar `renderMetricChart` (abaixo) para o caso de 1 só
 * avaliação, que mostra um cartão de valor atual em vez de um gráfico vazio.
 */
export function renderLineChartSvg(opts: LineChartOptions): string {
  const width = opts.width ?? 620;
  const height = opts.height ?? 220;
  const paddingLeft = 40;
  const paddingRight = 14;
  const paddingTop = 14;
  const paddingBottom = 26;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const n = opts.labels.length;

  const allValues = opts.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (allValues.length === 0 || n === 0) {
    return `<div class="chart-empty">Sem dados suficientes para este gráfico.</div>`;
  }

  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.15;
  min -= pad;
  max += pad;

  const xFor = (i: number) => (n === 1 ? paddingLeft + plotWidth / 2 : paddingLeft + (plotWidth * i) / (n - 1));
  const yFor = (v: number) => paddingTop + plotHeight - ((v - min) / (max - min)) * plotHeight;

  const gridLines = [0, 1, 2, 3].map((i) => {
    const v = min + ((max - min) * i) / 3;
    const y = yFor(v);
    return `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${(width - paddingRight).toFixed(1)}" y2="${y.toFixed(1)}" class="chart-grid-line" />
      <text x="${paddingLeft - 5}" y="${(y + 3).toFixed(1)}" class="chart-axis-label" text-anchor="end">${formatChartNumber(v)}</text>`;
  }).join('');

  const step = n > 8 ? Math.ceil(n / 8) : 1;
  const xLabels = opts.labels
    .map((label, i) => (i % step === 0 || i === n - 1 ? `<text x="${xFor(i).toFixed(1)}" y="${height - paddingBottom + 15}" class="chart-axis-label" text-anchor="middle">${escapeHtml(label)}</text>` : ''))
    .join('');

  const seriesSvg = opts.series
    .map((s) => {
      let path = '';
      let drawing = false;
      s.values.forEach((v, i) => {
        if (v == null) {
          drawing = false;
          return;
        }
        path += `${drawing ? 'L' : 'M'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `;
        drawing = true;
      });
      const dots = s.values
        .map((v, i) => (v == null ? '' : `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="2.6" fill="${s.color}" />`))
        .join('');
      const pathEl = path ? `<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="2" />` : '';
      return pathEl + dots;
    })
    .join('');

  const legend =
    opts.series.length > 1
      ? `<div class="chart-legend">${opts.series
          .map((s) => `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)} (${escapeHtml(s.unit)})</span>`)
          .join('')}</div>`
      : '';

  return `
    <div class="chart-block">
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">
        ${gridLines}
        ${seriesSvg}
        ${xLabels}
      </svg>
      ${legend}
    </div>`;
}

export interface PieSlice {
  label: string;
  color: string;
  value: number;
}

/**
 * Gráfico de pizza (composição corporal em %, um instantâneo da avaliação
 * atual — não é uma série no tempo). `slices` deve somar ~100; fatias com
 * `value <= 0` são ignoradas. Sem dependência nova: arco desenhado via
 * `stroke-dasharray` num círculo, técnica CSS/SVG padrão pra donut chart.
 */
export function renderPieChartSvg(slices: PieSlice[], size = 160): string {
  const valid = slices.filter((s) => s.value > 0);
  const total = valid.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return `<div class="chart-empty">Sem dados suficientes para este gráfico.</div>`;
  }

  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let offsetAccumulated = 0;

  const arcs = valid
    .map((slice) => {
      const fraction = slice.value / total;
      const dash = fraction * circumference;
      const gap = circumference - dash;
      const circle = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${slice.color}" stroke-width="${radius}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offsetAccumulated).toFixed(2)}" transform="rotate(-90 ${center} ${center})" />`;
      offsetAccumulated += dash;
      return circle;
    })
    .join('');

  const legend = `<div class="chart-legend">${valid
    .map((s) => `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}: ${formatChartNumber((s.value / total) * 100)}%</span>`)
    .join('')}</div>`;

  return `
    <div class="pie-chart-block">
      <svg viewBox="0 0 ${size} ${size}" class="pie-chart-svg" xmlns="http://www.w3.org/2000/svg">${arcs}</svg>
      ${legend}
    </div>`;
}

function formatValueTile(label: string, value: number | null, unit: string): string {
  return `<div class="tile"><div class="label">${escapeHtml(label)}</div><div class="value">${value == null ? '—' : `${formatChartNumber(value)}${unit}`}</div></div>`;
}

/**
 * Envelope de um gráfico de métrica: título + gráfico de linha quando há
 * 2+ avaliações; com 1 avaliação só, mostra um cartão de valor atual em vez
 * de um gráfico quebrado/vazio (exigência explícita do relatório).
 */
export function renderMetricChart(title: string, labels: string[], series: ChartSeriesInput[]): string {
  const hasEnoughPoints = labels.length >= 2 && series.some((s) => s.values.filter((v) => v != null).length >= 2);

  const body = hasEnoughPoints
    ? renderLineChartSvg({ labels, series })
    : `<div class="chart-single-value">${series.map((s) => formatValueTile(s.label, s.values.length ? s.values[s.values.length - 1] : null, s.unit)).join('')}</div>`;

  return `<div class="chart-card"><h3 class="chart-title">${escapeHtml(title)}</h3>${body}</div>`;
}

export { formatShortDate };
