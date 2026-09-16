export const REPORT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
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
    margin-bottom: 18px;
  }
  header.report-header .brand { font-size: 18px; font-weight: 700; color: #123c2e; }
  header.report-header .kind { font-size: 11px; color: #54635a; text-transform: uppercase; letter-spacing: .05em; }
  header.report-header .meta { text-align: right; font-size: 10.5px; color: #54635a; }
  h2.section-title {
    font-size: 13px;
    color: #123c2e;
    border-left: 3px solid #1f7a5c;
    padding-left: 8px;
    margin: 20px 0 10px;
  }
  .identity-grid, .metric-grid, .measure-grid, .comp-grid {
    display: grid;
    gap: 8px;
    margin-bottom: 4px;
  }
  .identity-grid { grid-template-columns: repeat(3, 1fr); }
  .metric-grid { grid-template-columns: repeat(4, 1fr); }
  .measure-grid, .comp-grid { grid-template-columns: repeat(4, 1fr); }
  .tile {
    border: 1px solid #dde4dc;
    border-radius: 6px;
    padding: 8px 10px;
    background: #f6f8f5;
  }
  .tile .label { font-size: 9px; color: #8b988e; text-transform: uppercase; letter-spacing: .04em; }
  .tile .value { font-size: 14px; font-weight: 700; color: #123c2e; margin-top: 2px; }
  table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.data-table th, table.data-table td {
    text-align: left; padding: 5px 8px; border-bottom: 1px solid #eef2ec; font-size: 10.5px;
  }
  table.data-table th { color: #54635a; font-weight: 600; }
  .comparison-row { display: flex; gap: 16px; padding: 6px 0; }
  .comparison-row div { font-size: 11px; }
  .comparison-row b { color: #1f7a5c; }
  .notes-box { border: 1px dashed #c7d1c5; border-radius: 6px; padding: 10px; font-size: 10.5px; color: #54635a; }
  .photos-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
  .photos-grid figure { margin: 0; }
  .photos-grid img { width: 100%; border-radius: 4px; border: 1px solid #dde4dc; }
  .photos-grid figcaption { font-size: 9px; color: #8b988e; text-align: center; margin-top: 2px; }
  footer.report-footer {
    margin-top: 24px; padding-top: 8px; border-top: 1px solid #dde4dc;
    font-size: 9px; color: #8b988e; display: flex; justify-content: space-between;
  }
`;
