import { renderClientReportHtml, renderProfessionalReportHtml } from '../src/reports/templates/evaluation-report.template';
import type { ClientEvaluationReportData, ProfessionalEvaluationReportData } from '../src/reports/templates/report-types';

// Teste unitário puro (sem app Nest, sem banco, sem Puppeteer) — prova que
// o template do relatório cliente nunca serializa campo técnico algum,
// mesmo que os dados de origem carreguem tudo (dobras, protocolo, pressão,
// glicemia, notas, origem de bioimpedância) — allowlist da Fase 8/9, e que
// o relatório profissional (Fase de redesenho — 4 páginas) monta
// corretamente resumo, gráficos, medidas/dobras e fotos.
describe('Templates de relatório', () => {
  const core: Omit<ProfessionalEvaluationReportData, 'generatedAt'> = {
    clientName: 'Maria da Silva',
    professionalName: 'Dr. João Professional',
    evaluatedAt: '2026-01-01T00:00:00Z',
    ageAtEvaluation: 30,
    biologicalSexForCalculation: 'female',
    heightCm: 165,
    weightKg: 60,
    bmi: 22,
    bmiClassification: 'peso normal',
    bodyFatPercent: 20,
    fatMassKg: 12,
    leanMassKg: 48,
    waistHipRatio: 0.74,
    measurements: {
      chestCm: 90,
      waistCm: 70,
      abdomenCm: 75,
      hipCm: 95,
      armRightCm: 28,
      armLeftCm: 27.5,
      forearmRightCm: 24,
      forearmLeftCm: 23.5,
      thighRightCm: 52,
      thighLeftCm: 51.5,
      calfRightCm: 34,
      calfLeftCm: 33.5,
      wristCm: 15,
      femurBicondylarCm: 8.5,
    },
    composition: {
      muscleMassKg: 25,
      skeletalMuscleMassKg: 22,
      bodyWaterPercent: 55,
      visceralFatLevel: 5,
      boneMassKg: 2.5,
      basalMetabolicRateKcal: 1400,
      bodyAgeYears: 28,
    },
    comparison: {
      previousEvaluatedAt: '2025-10-01T00:00:00Z',
      weightKg: -2,
      bodyFatPercent: -1,
      leanMassKg: 1,
      fatMassKg: -1,
      muscleMassKg: 1,
      skeletalMuscleMassKg: 1,
      musclePercent: 0.8,
      skeletalMusclePercent: 0.5,
    },
    overallComparison: {
      previousEvaluatedAt: '2025-06-01T00:00:00Z',
      weightKg: -5,
      bodyFatPercent: -3,
      leanMassKg: 3,
      fatMassKg: -4,
      muscleMassKg: 3,
      skeletalMuscleMassKg: 2,
      musclePercent: 1.5,
      skeletalMusclePercent: 1,
    },
    bodyFatPercentSource: 'skinfolds',
    skinfolds: {
      chestMm: 8,
      axillaryMidMm: 10,
      subscapularMm: 12,
      bicepsMm: null,
      tricepsMm: 9,
      abdominalMm: 15,
      suprailiacMm: 11,
      thighMm: 14,
      calfMm: null,
    },
    protocolLabel: 'Jackson & Pollock — 7 dobras (v1)',
    bioimpedanceOrigin: 'manual',
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    heartRate: 70,
    glucose: 90,
    notes: 'Nota clínica confidencial — atenção ao joelho direito',
    photos: [],
    series: [
      {
        evaluatedAt: '2025-06-01T00:00:00Z',
        ageAtEvaluation: 29,
        weightKg: 65,
        bodyFatPercent: 23,
        fatMassKg: 15,
        leanMassKg: 50,
        muscleMassKg: 23,
        skeletalMuscleMassKg: 20,
        bodyWaterPercent: 52,
        bodyAgeYears: 31,
        boneMassKg: 2.4,
      },
      {
        evaluatedAt: '2025-10-01T00:00:00Z',
        ageAtEvaluation: 30,
        weightKg: 62,
        bodyFatPercent: 21,
        fatMassKg: 13,
        leanMassKg: 47,
        muscleMassKg: 24,
        skeletalMuscleMassKg: 21,
        bodyWaterPercent: 54,
        bodyAgeYears: 29,
        boneMassKg: 2.45,
      },
      {
        evaluatedAt: '2026-01-01T00:00:00Z',
        ageAtEvaluation: 30,
        weightKg: 60,
        bodyFatPercent: 20,
        fatMassKg: 12,
        leanMassKg: 48,
        muscleMassKg: 25,
        skeletalMuscleMassKg: 22,
        bodyWaterPercent: 55,
        bodyAgeYears: 28,
        boneMassKg: 2.5,
      },
    ],
    previous: {
      evaluatedAt: '2025-10-01T00:00:00Z',
      measurements: {
        chestCm: 91,
        waistCm: 72,
        abdomenCm: 77,
        hipCm: 96,
        armRightCm: 27.5,
        armLeftCm: 27,
        forearmRightCm: 23.5,
        forearmLeftCm: 23,
        thighRightCm: 51,
        thighLeftCm: 50.5,
        calfRightCm: 33.5,
        calfLeftCm: 33,
        wristCm: 15,
        femurBicondylarCm: 8.5,
      },
      skinfolds: null,
      bloodPressureSystolic: 118,
      bloodPressureDiastolic: 78,
    },
    first: {
      evaluatedAt: '2025-06-01T00:00:00Z',
      measurements: {
        chestCm: 93,
        waistCm: 75,
        abdomenCm: 80,
        hipCm: 98,
        armRightCm: 27,
        armLeftCm: 26.5,
        forearmRightCm: 23,
        forearmLeftCm: 22.5,
        thighRightCm: 50,
        thighLeftCm: 49.5,
        calfRightCm: 33,
        calfLeftCm: 32.5,
        wristCm: 15,
        femurBicondylarCm: 8.5,
      },
      skinfolds: null,
      bloodPressureSystolic: 122,
      bloodPressureDiastolic: 80,
    },
  };

  function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  it('relatório profissional inclui dado técnico completo', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderProfessionalReportHtml(data);

    expect(html).toContain('Maria da Silva');
    expect(html).toContain('8 mm'); // dobra do tórax
    expect(html).toContain('Jackson &amp; Pollock');
    expect(html).toContain('120/80'); // pressão
    expect(html).toContain('90 mg/dL'); // glicemia
    expect(html).toContain('70 bpm'); // frequência cardíaca
    expect(html).toContain('Nota clínica confidencial');
    expect(html).toContain('skinfolds'); // fonte do %gordura
  });

  it('relatório cliente NUNCA inclui dobras, protocolo, pressão, glicemia, notas ou origem de bioimpedância', () => {
    const clientData: ClientEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderClientReportHtml(clientData);

    expect(html).toContain('Maria da Silva'); // identificação permanece
    expect(html).toContain('Massa muscular'); // composição permanece
    expect(html).toContain('Cintura'); // circunferências permanecem

    expect(html).not.toContain('8 mm');
    expect(html).not.toContain('dobra');
    expect(html).not.toContain('Jackson');
    expect(html).not.toContain('120/80');
    expect(html).not.toContain('90 mg/dL');
    expect(html).not.toContain('70 bpm');
    expect(html).not.toContain('Nota clínica confidencial');
    expect(html).not.toContain('joelho direito');
    expect(html).not.toContain('skinfolds');
    expect(html).not.toContain('manual'); // origem da bioimpedância
  });

  it('relatório cliente não tem seção de fotos, gráficos ou medidas técnicas de página 3 (dados nunca chegam ao template cliente)', () => {
    const clientData: ClientEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderClientReportHtml(clientData);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Fotos');
    expect(html).not.toContain('Evolução gráfica');
    expect(html).not.toContain('Medidas e dobras');
  });

  it('ambos os relatórios escapam HTML de campos vindos do usuário (nome, notas)', () => {
    const maliciousCore = { ...core, clientName: '<script>alert(1)</script>' };
    const professionalHtml = renderProfessionalReportHtml({ ...maliciousCore, generatedAt: '2026-01-15T00:00:00Z' });
    const clientHtml = renderClientReportHtml({ ...maliciousCore, generatedAt: '2026-01-15T00:00:00Z' });

    expect(professionalHtml).not.toContain('<script>alert(1)</script>');
    expect(professionalHtml).toContain('&lt;script&gt;');
    expect(clientHtml).not.toContain('<script>alert(1)</script>');
    expect(clientHtml).toContain('&lt;script&gt;');
  });

  it('quando não há comparação anterior, o resumo mostra só a avaliação atual (não inventa histórico)', () => {
    const data: ClientEvaluationReportData = { ...core, comparison: null, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderClientReportHtml(data);
    expect(html).toContain('primeira avaliação registrada');
    expect(html).not.toContain('dia(s) entre avaliações');
  });

  it('página 2 traz os 5 gráficos de evolução exigidos (peso, composição em 2 pizzas, %, água, idade), todos com dado real', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderProfessionalReportHtml(data);

    expect(html).toContain('Evolução gráfica');
    expect(html).toContain('Peso corporal');
    expect(html).toContain('Bi-compartimental');
    expect(html).toContain('Tetra-compartimental');
    expect(html).toContain('Músculo e gordura em percentual');
    expect(html).toContain('Água corporal');
    expect(html).toContain('Idade corporal');
    // 3 pontos na série → gráficos de linha reais (peso, %, água, idade = 4 svgs de linha)
    expect(html.match(/<svg[^>]*class="chart-svg"/g)?.length).toBe(4);
    // composição corporal atual (instantâneo, não depende da série) → 2 pizzas sempre que houver dado
    expect(html.match(/<svg[^>]*class="pie-chart-svg"/g)?.length).toBe(2);
  });

  it('com 3+ avaliações, o resumo mostra a tabela dupla Último/Geral; com só 1 avaliação anterior, mostra 1 coluna só', () => {
    const dualPeriodData: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const dualHtml = renderProfessionalReportHtml(dualPeriodData);
    expect(dualHtml).toContain('<th class="num">Último</th><th class="num">Geral</th>');
    expect(dualHtml).toContain('-2 kg'); // delta "Último" (peso: 62→60)
    expect(dualHtml).toContain('-5 kg'); // delta "Geral" (peso: 65→60)

    const singlePeriodData: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      overallComparison: null,
      first: null,
      series: [core.series[1], core.series[2]], // só 1 avaliação antes da atual → sem "Geral" distinto
    };
    const singleHtml = renderProfessionalReportHtml(singlePeriodData);
    expect(singleHtml).not.toContain('<th class="num">Último</th><th class="num">Geral</th>');
    expect(singleHtml).toContain('Desde a avaliação anterior');
  });

  it('as pizzas de composição corporal aparecem só quando há % de gordura e peso calculados nesta avaliação', () => {
    const withData: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    expect(renderProfessionalReportHtml(withData)).toContain('class="pie-chart-svg"');

    const withoutBodyFat: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z', bodyFatPercent: null };
    const html = renderProfessionalReportHtml(withoutBodyFat);
    expect(html).not.toContain('class="pie-chart-svg"');
    expect(html).toContain('Sem % de gordura calculado nesta avaliação.');
    expect(html).toContain('Sem dados suficientes para este gráfico.'); // tetra também depende de bodyFatPercent
  });

  it('com apenas uma avaliação (sem histórico), os gráficos de linha não quebram — mostram cartão de valor atual (as pizzas continuam, são instantâneo)', () => {
    const singlePointData: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      comparison: null,
      previous: null,
      overallComparison: null,
      first: null,
      series: [core.series[2]], // só a avaliação atual
    };
    const html = renderProfessionalReportHtml(singlePointData);

    // peso, %, água, idade → cartão de valor único (4); as 2 pizzas usam o
    // instantâneo atual, não a série, então continuam aparecendo normalmente
    expect(html).not.toContain('class="chart-svg"');
    expect(countOccurrences(html, 'class="chart-single-value"')).toBe(4);
    expect(html.match(/<svg[^>]*class="pie-chart-svg"/g)?.length).toBe(2);
    expect(html).not.toContain('class="chart-empty"'); // há dado (1 ponto), então não é "sem dados"
  });

  it('avaliação sem nenhum dado de composição/medida não quebra os gráficos de linha (cartão com "—" em vez de gráfico vazio)', () => {
    const emptySeriesPoint = {
      evaluatedAt: '2026-01-15T00:00:00Z',
      ageAtEvaluation: null,
      weightKg: null,
      bodyFatPercent: null,
      fatMassKg: null,
      leanMassKg: null,
      muscleMassKg: null,
      skeletalMuscleMassKg: null,
      bodyWaterPercent: null,
      bodyAgeYears: null,
      boneMassKg: null,
    };
    const data: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      comparison: null,
      previous: null,
      overallComparison: null,
      first: null,
      series: [emptySeriesPoint],
    };
    const html = renderProfessionalReportHtml(data);
    // com só 1 avaliação (mesmo sem dado nela), os gráficos de linha sempre
    // caem no cartão de valor único, nunca tentam desenhar um <svg> com uma
    // série vazia — as pizzas usam `core` diretamente (avaliação atual tem
    // dado no fixture), então continuam aparecendo.
    expect(html).not.toContain('class="chart-svg"');
    expect(countOccurrences(html, 'class="chart-single-value"')).toBe(4);
    expect(html.match(/<svg[^>]*class="pie-chart-svg"/g)?.length).toBe(2);
  });

  it('página 3 mostra medidas de tronco, membros e dobras; sem fotos, a página 4 não é gerada', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z', photos: [] };
    const html = renderProfessionalReportHtml(data);

    expect(html).toContain('Medidas do tronco');
    expect(html).toContain('Membros superiores');
    expect(html).toContain('Membros inferiores');
    expect(html).toContain('Dobras cutâneas');
    // 2 quebras de página (gráficos, medidas) — nenhuma terceira pra fotos
    expect(countOccurrences(html, 'class="page-break"')).toBe(2);
    expect(html).not.toContain('page-title">Fotos');
  });

  it('com fotos, a página 4 aparece com legendas em português e nenhuma URL interna de storage', () => {
    const data: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      photos: [
        { angle: 'front', dataUri: 'data:image/png;base64,AAAA' },
        { angle: 'back', dataUri: 'data:image/png;base64,BBBB' },
      ],
    };
    const html = renderProfessionalReportHtml(data);

    expect(countOccurrences(html, 'class="page-break"')).toBe(3);
    expect(html).toContain('<img src="data:image/png;base64,AAAA">');
    expect(html).toContain('Frente');
    expect(html).toContain('Costas');
    expect(html).not.toContain('/files/'); // nunca a URL assinada/interna, só a imagem embutida
  });

  it('rodapé de página não é renderizado no HTML — fica a cargo do footerTemplate do Puppeteer', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderProfessionalReportHtml(data);
    expect(html).not.toContain('report-footer');
  });

  it('quando o protocolo usa dobras cutâneas, a página 1 informa "Dobras Cutâneas - N dobras" (dado real, não fixo)', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z', protocolLabel: 'Dobras Cutâneas - 7 dobras' };
    const html = renderProfessionalReportHtml(data);
    expect(html).toContain('Dobras Cutâneas - 7 dobras');
  });
});
