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
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

export interface ChartSeriesInput {
  label: string;
  color: string;
  unit: string;
  values: Array<number | null>;
}

export interface ReferenceLine {
  value: number;
  label: string;
  color: string;
}

export interface LineChartOptions {
  labels: string[];
  series: ChartSeriesInput[];
  width?: number;
  height?: number;
  /** Linhas horizontais de referência (ex.: pressão até 120/80) — sempre dentro da escala. */
  referenceLines?: ReferenceLine[];
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

  const dataValues = opts.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const allValues = [...dataValues, ...(opts.referenceLines ?? []).map((line) => line.value)];
  if (dataValues.length === 0 || n === 0) {
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

  const referenceSvg = (opts.referenceLines ?? [])
    .map((line) => {
      const y = yFor(line.value);
      return `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${(width - paddingRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${line.color}" stroke-width="1.2" stroke-dasharray="4 3" />
      <text x="${paddingLeft + 4}" y="${(y - 3).toFixed(1)}" class="chart-axis-label" fill="${line.color}">${escapeHtml(line.label)}</text>`;
    })
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
      // Só desenha a linha se houver pelo menos um segmento (ponto isolado fica só como marcador).
      const pathEl = path.includes('L') ? `<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="2" />` : '';
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
        ${referenceSvg}
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

export interface BarChartOptions {
  labels: string[];
  series: Array<{ label: string; color: string; values: Array<number | null> }>;
  /** "stacked": uma coluna por avaliação, partes empilhadas; "grouped": colunas lado a lado. */
  mode: 'stacked' | 'grouped';
  /** Escreve a soma no topo de cada coluna empilhada (ex.: soma das dobras). */
  showTotals?: boolean;
  width?: number;
  height?: number;
}

/** Topo "redondo" da escala, para os rótulos do eixo saírem em números inteiros legíveis. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

/**
 * Barras a partir do zero, uma posição por avaliação. Dado ausente vira parte
 * vazia (não é contado como zero na soma). Com uma avaliação só, desenha a
 * coluna dela — barra não precisa de dois pontos como a linha.
 */
export function renderBarChartSvg(opts: BarChartOptions): string {
  const width = opts.width ?? 620;
  const height = opts.height ?? 220;
  const paddingLeft = 40;
  const paddingRight = 14;
  const paddingTop = opts.showTotals ? 22 : 14;
  const paddingBottom = 26;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const n = opts.labels.length;

  const totals = opts.labels.map((_, i) => opts.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const tallest = opts.mode === 'stacked' ? Math.max(0, ...totals) : Math.max(0, ...opts.series.flatMap((s) => s.values.filter((v): v is number => v != null)));
  if (n === 0 || tallest <= 0) {
    return `<div class="chart-empty">Sem dados suficientes para este gráfico.</div>`;
  }

  const max = niceMax(tallest);
  const yFor = (v: number) => paddingTop + plotHeight - (v / max) * plotHeight;
  const slot = plotWidth / n;
  const columnWidth = Math.min(46, slot * 0.5);

  const gridLines = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = (max * i) / 4;
      const y = yFor(v);
      return `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${(width - paddingRight).toFixed(1)}" y2="${y.toFixed(1)}" class="chart-grid-line" />
      <text x="${paddingLeft - 5}" y="${(y + 3).toFixed(1)}" class="chart-axis-label" text-anchor="end">${formatChartNumber(v)}</text>`;
    })
    .join('');

  const bars = opts.labels
    .map((_, i) => {
      const center = paddingLeft + slot * i + slot / 2;
      if (opts.mode === 'stacked') {
        let base = 0;
        const parts = opts.series
          .map((s) => {
            const v = s.values[i];
            if (v == null || v <= 0) return '';
            const top = yFor(base + v);
            const rect = `<rect x="${(center - columnWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${columnWidth.toFixed(1)}" height="${(yFor(base) - top).toFixed(1)}" fill="${s.color}" />`;
            base += v;
            return rect;
          })
          .join('');
        const total =
          opts.showTotals && totals[i] > 0
            ? `<text x="${center.toFixed(1)}" y="${(yFor(totals[i]) - 4).toFixed(1)}" class="chart-axis-label" text-anchor="middle" font-weight="700">${formatChartNumber(totals[i])}</text>`
            : '';
        return parts + total;
      }
      const barWidth = columnWidth / Math.max(1, opts.series.length) * 1.6;
      const groupWidth = barWidth * opts.series.length;
      return opts.series
        .map((s, k) => {
          const v = s.values[i];
          if (v == null || v <= 0) return '';
          const x = center - groupWidth / 2 + barWidth * k;
          return `<rect x="${x.toFixed(1)}" y="${yFor(v).toFixed(1)}" width="${(barWidth - 2).toFixed(1)}" height="${(yFor(0) - yFor(v)).toFixed(1)}" fill="${s.color}" />`;
        })
        .join('');
    })
    .join('');

  const step = n > 8 ? Math.ceil(n / 8) : 1;
  const xLabels = opts.labels
    .map((label, i) =>
      i % step === 0 || i === n - 1
        ? `<text x="${(paddingLeft + slot * i + slot / 2).toFixed(1)}" y="${height - paddingBottom + 15}" class="chart-axis-label" text-anchor="middle">${escapeHtml(label)}</text>`
        : '',
    )
    .join('');

  const legend = `<div class="chart-legend">${opts.series
    .map((s) => `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`)
    .join('')}</div>`;

  return `
    <div class="chart-block">
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg bar-chart-svg" xmlns="http://www.w3.org/2000/svg">
        ${gridLines}
        ${bars}
        ${xLabels}
      </svg>
      ${legend}
    </div>`;
}

/** Cartão de gráfico com título e subtítulo, como os da página de evolução do laudo de referência. */
export function renderChartCard(title: string, subtitle: string, body: string): string {
  return `<div class="chart-card"><h3 class="chart-title">${escapeHtml(title)}</h3><div class="chart-subtitle">${escapeHtml(subtitle)}</div>${body}</div>`;
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
