export const REPORT_CSS = `
  /* Margens reais vêm de page.pdf({ margin }) no Puppeteer (render-pdf.js),
     não daqui — displayHeaderFooter precisa que a margem seja definida
     nessa API para reservar espaço pro rodapé com numeração de página. */
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #16211c;
    font-size: 11.5px;
    line-height: 1.5;
    margin: 0;
  }
  header.report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #1f7a5c;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }
  header.report-header .brand { font-size: 18px; font-weight: 700; color: #123c2e; }
  header.report-header .kind { font-size: 11px; color: #54635a; text-transform: uppercase; letter-spacing: .05em; }
  header.report-header .meta { text-align: right; font-size: 10.5px; color: #54635a; }
  h1.page-title {
    font-size: 14px;
    color: #123c2e;
    margin: 0 0 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  h2.section-title {
    font-size: 13px;
    color: #123c2e;
    border-left: 3px solid #1f7a5c;
    padding-left: 8px;
    margin: 14px 0 8px;
  }
  h2.section-title:first-child { margin-top: 0; }
  h3.chart-title { font-size: 11.5px; color: #123c2e; margin: 0 0 6px; font-weight: 700; }

  .identity-grid, .metric-grid, .measure-grid, .comp-grid {
    display: grid;
    gap: 6px;
    margin-bottom: 4px;
  }
  .identity-grid { grid-template-columns: repeat(3, 1fr); }
  .metric-grid { grid-template-columns: repeat(4, 1fr); }
  .comp-grid { grid-template-columns: repeat(4, 1fr); }
  /* 7 colunas: as 14 circunferências cabem em 2 linhas em vez de 4 — página 1
     tem pouco espaço sobrando pra esta seção junto do resto do resumo. */
  .measure-grid { grid-template-columns: repeat(7, 1fr); }
  .tile {
    border: 1px solid #dde4dc;
    border-radius: 6px;
    padding: 6px 8px;
    background: #f6f8f5;
  }
  .measure-grid .tile { padding: 5px 6px; }
  .tile .label { font-size: 9px; color: #8b988e; text-transform: uppercase; letter-spacing: .04em; }
  .measure-grid .tile .label { font-size: 7.5px; }
  .tile .value { font-size: 14px; font-weight: 700; color: #123c2e; margin-top: 2px; }
  .measure-grid .tile .value { font-size: 11px; }
  .tile .classification { font-size: 9.5px; color: #1f7a5c; font-weight: 600; margin-top: 1px; }

  table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.data-table th, table.data-table td {
    text-align: left; padding: 3px 8px; border-bottom: 1px solid #eef2ec; font-size: 10px;
  }
  table.data-table th { color: #54635a; font-weight: 600; }
  table.data-table td.num, table.data-table th.num { text-align: right; }
  table.data-table td.delta-up { color: #1f7a5c; font-weight: 600; }
  table.data-table td.delta-down { color: #b5651d; font-weight: 600; }

  .comparison-row { display: flex; gap: 16px; padding: 6px 0; flex-wrap: wrap; }
  .comparison-row div { font-size: 11px; }
  .comparison-row b { color: #1f7a5c; }
  .comparison-empty { font-size: 10.5px; color: #8b988e; }
  .notes-box { border: 1px dashed #c7d1c5; border-radius: 6px; padding: 10px; font-size: 10.5px; color: #54635a; }

  .photos-grid { display: grid; gap: 8px; margin-top: 8px; }
  .photos-grid.cols-1 { grid-template-columns: 1fr; }
  .photos-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .photos-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .photos-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .photos-grid figure { margin: 0; }
  .photos-grid img { width: 100%; border-radius: 4px; border: 1px solid #dde4dc; object-fit: cover; aspect-ratio: 3 / 4; }
  .photos-grid figcaption { font-size: 9px; color: #8b988e; text-align: center; margin-top: 2px; }
  .photos-empty { font-size: 10.5px; color: #8b988e; }

  .page-break { page-break-before: always; padding-top: 2px; }

  .chart-grid-page { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 6px; }
  .chart-grid-page .chart-card.full { grid-column: 1 / -1; }
  .chart-card {
    border: 1px solid #dde4dc;
    border-radius: 6px;
    padding: 10px;
    background: #fbfcfa;
  }
  .chart-svg { width: 100%; height: auto; display: block; }
  .chart-grid-line { stroke: #e4e9e2; stroke-width: 1; }
  .chart-axis-label { font-size: 8px; fill: #8b988e; }
  .chart-empty { font-size: 10.5px; color: #8b988e; padding: 20px 0; text-align: center; }
  .chart-single-value { display: flex; gap: 8px; }
  .chart-legend { display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
  .chart-legend-item { font-size: 9px; color: #54635a; display: inline-flex; align-items: center; gap: 4px; }
  .chart-legend-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

  .pie-chart-block { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .pie-chart-svg { width: 120px; height: 120px; }
  .pie-chart-block .chart-legend { flex-direction: column; gap: 3px; align-items: flex-start; }

  /* Página 1 — composição em tabelas de 2 colunas (Descrição/Resultado/Avaliação),
     igual ao layout de referência, em vez de cartões soltos. */
  .composition-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
  table.metric-table { width: 100%; border-collapse: collapse; border: 1px solid #dde4dc; border-radius: 6px; overflow: hidden; }
  table.metric-table th { background: #f6f8f5; color: #54635a; font-weight: 600; font-size: 9.5px; text-align: left; padding: 5px 8px; border-bottom: 1px solid #dde4dc; }
  table.metric-table td { padding: 5px 8px; border-bottom: 1px solid #eef2ec; font-size: 10.5px; vertical-align: top; }
  table.metric-table td.num { text-align: right; font-weight: 700; color: #123c2e; white-space: nowrap; }
  table.metric-table td.eval { text-align: right; white-space: nowrap; }
  table.metric-table tr:last-child td { border-bottom: none; }
  .metric-ref { display: block; font-size: 8.5px; color: #8b988e; font-weight: 400; }
`;
