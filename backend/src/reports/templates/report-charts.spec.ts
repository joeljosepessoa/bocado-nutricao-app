import { renderLineChartSvg, renderMetricChart } from './report-charts';

describe('renderLineChartSvg', () => {
  it('desenha um path e um círculo por ponto de uma série com dado completo', () => {
    const html = renderLineChartSvg({
      labels: ['01/10', '01/01'],
      series: [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [62, 60] }],
    });
    expect(html).toContain('<path');
    expect((html.match(/<circle/g) ?? []).length).toBe(2);
  });

  it('quebra o traçado (não interpola) quando há um valor null no meio da série', () => {
    const html = renderLineChartSvg({
      labels: ['jan', 'fev', 'mar'],
      series: [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [60, null, 58] }],
    });
    // 2 pontos com dado → 2 círculos, mas 2 comandos "M" (moveTo) porque o
    // null no meio interrompe o traçado em vez de ligar os dois extremos
    expect((html.match(/<circle/g) ?? []).length).toBe(2);
    const pathMatch = html.match(/<path d="([^"]+)"/);
    expect(pathMatch).not.toBeNull();
    expect((pathMatch![1].match(/M/g) ?? []).length).toBe(2);
  });

  it('sem nenhum valor numérico em nenhuma série, mostra mensagem de "sem dados" em vez de um SVG vazio', () => {
    const html = renderLineChartSvg({
      labels: ['jan', 'fev'],
      series: [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [null, null] }],
    });
    expect(html).toContain('chart-empty');
    expect(html).not.toContain('<svg');
  });

  it('sem nenhum rótulo (n=0), também cai no estado "sem dados"', () => {
    const html = renderLineChartSvg({ labels: [], series: [] });
    expect(html).toContain('chart-empty');
  });

  it('2 séries no mesmo gráfico geram legenda com as 2 cores/labels', () => {
    const html = renderLineChartSvg({
      labels: ['jan', 'fev'],
      series: [
        { label: 'Massa gorda', unit: 'kg', color: '#b5651d', values: [12, 11] },
        { label: 'Massa magra', unit: 'kg', color: '#1f7a5c', values: [48, 49] },
      ],
    });
    expect(html).toContain('Massa gorda');
    expect(html).toContain('Massa magra');
    expect((html.match(/chart-legend-item/g) ?? []).length).toBe(2);
  });
});

describe('renderMetricChart', () => {
  it('com 2+ avaliações e dado real, renderiza o gráfico de linha (svg)', () => {
    const html = renderMetricChart('Peso corporal', ['jan', 'fev'], [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [60, 58] }]);
    expect(html).toContain('<svg');
    expect(html).toContain('Peso corporal');
  });

  it('com 1 avaliação só, mostra um cartão de valor atual em vez de gráfico quebrado/vazio', () => {
    const html = renderMetricChart('Peso corporal', ['jan'], [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [60] }]);
    expect(html).not.toContain('<svg');
    expect(html).toContain('chart-single-value');
    expect(html).toContain('60kg');
  });

  it('com histórico mas o valor mais recente ausente, o cartão de fallback mostra "—" (não inventa valor)', () => {
    const html = renderMetricChart('Peso corporal', ['jan'], [{ label: 'Peso', unit: 'kg', color: '#1f7a5c', values: [null] }]);
    expect(html).toContain('—');
    expect(html).not.toContain('nullkg');
  });
});
