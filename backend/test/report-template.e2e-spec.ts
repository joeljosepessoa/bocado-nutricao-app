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
  // A série inclui a avaliação atual (última): medidas, pressão e dobras dela
  // são as mesmas do núcleo — como o serviço monta na vida real.
  core.series[2] = { ...core.series[2], measurements: core.measurements, bloodPressureSystolic: 120, bloodPressureDiastolic: 80, skinfolds: core.skinfolds };

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
    expect(html).toContain('Fonte do %gordura: dobras cutâneas');
    expect(html).not.toContain('skinfolds'); // o código interno nunca vai para o papel
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

  it('página 2 traz peso, as 2 pizzas de composição, % e água; idade corporal vai para a página 3, como no laudo de referência', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderProfessionalReportHtml(data);

    expect(html).toContain('Evolução gráfica');
    expect(html).toContain('Peso corporal');
    expect(html).toContain('Bi-compartimental');
    expect(html).toContain('Tetra-compartimental');
    expect(html).toContain('Músculo e gordura em percentual');
    expect(html).toContain('Água corporal');
    expect(html).toContain('Idade corporal');
    // 3 pontos na série → linhas reais na página 2 (peso, %, água) e na página 3 (tronco, pressão) = 5
    expect(html.match(/<svg[^>]*class="chart-svg"/g)?.length).toBe(5);
    expect(html.indexOf('Idade corporal</h3>')).toBeGreaterThan(html.indexOf('Evolução das medidas'));
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

  it('pizza tetra-compartimental não é desenhada sem músculo esquelético ou massa óssea — o que falta nunca vira "massa residual"', () => {
    // Avaliação só com dobras (sem bioimpedância): há % de gordura e peso, mas não os outros compartimentos.
    const onlySkinfolds: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z', composition: null };
    const html = renderProfessionalReportHtml(onlySkinfolds);
    expect(html.match(/<svg[^>]*class="pie-chart-svg"/g)?.length).toBe(1); // só a bi-compartimental
    expect(html).toContain('Sem músculo esquelético e massa óssea registrados nesta avaliação.');
    expect(html).not.toContain('Massa residual');

    // Sem massa óssea não há como chegar ao músculo esquelético — continua sem a pizza.
    const withoutBone: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      composition: { ...core.composition!, skeletalMuscleMassKg: null, boneMassKg: null },
    };
    expect(renderProfessionalReportHtml(withoutBone)).not.toContain('Massa residual');

    // Com massa óssea, o músculo esquelético sai das medidas e a pizza volta.
    const derivable: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-01-15T00:00:00Z',
      composition: { ...core.composition!, skeletalMuscleMassKg: null },
    };
    expect(renderProfessionalReportHtml(derivable)).toContain('Massa residual');
  });

  it('página 1 confere com o laudo de referência: resultados, avaliação e faixas (homem, 39 anos, 195 cm, 107,7 kg)', () => {
    const data: ProfessionalEvaluationReportData = {
      ...core,
      generatedAt: '2026-10-11T00:00:00Z',
      ageAtEvaluation: 39,
      biologicalSexForCalculation: 'male',
      heightCm: 195,
      weightKg: 107.7,
      bmi: 28.3,
      bmiClassification: 'sobrepeso',
      bodyFatPercent: 24.5,
      fatMassKg: 26.39,
      leanMassKg: 81.31,
      waistHipRatio: 0.97,
      bmrReference: 'harris_benedict',
      // O aparelho deu só estes; músculo esquelético e massa muscular saem das medidas.
      composition: { muscleMassKg: null, skeletalMuscleMassKg: null, bodyWaterPercent: 57.9, visceralFatLevel: 11, boneMassKg: 5.03, basalMetabolicRateKcal: 2075, bodyAgeYears: 40 },
      bloodPressureSystolic: 130,
      bloodPressureDiastolic: 80,
    };
    const html = renderProfessionalReportHtml(data);
    const row = (label: string, reference: string | null, value: string, classification: string) =>
      `<tr><td>${label}${reference ? `<div style="font-size:9px;color:#8b988e;">Referência: ${reference}</div>` : ''}</td><td class="num">${value}</td><td class="eval">${classification}</td></tr>`;

    expect(html).toContain(row('Peso', '70,3~95,1 kg', '107,7 kg', 'Acima 12,6 kg'));
    expect(html).toContain(row('IMC', '18,5~25,0 kg/m²', '28,3 kg/m²', 'Acima (sobrepeso)'));
    expect(html).toContain(row('Músculo esquelético', '33,3~39,3 %', '46,7 % · 50,3 kg', 'Excelente'));
    expect(html).toContain(row('Massa muscular', null, '70,8 % · 76,3 kg', '—'));
    expect(html).toContain(row('Gordura corporal', null, '24,5 % · 26,4 kg', '—'));
    expect(html).toContain(row('Água corporal', null, '57,9 % · 62,4 kg', '—'));
    expect(html).toContain(row('Massa óssea', null, '5,03 kg', '—'));
    expect(html).toContain(row('Idade corporal', null, '40 anos', '+1 ano(s)'));
    expect(html).toContain(row('Gordura visceral', '1~9', '11', 'Acima'));
    expect(html).toContain(row('Metabolismo basal', '1744~2085 kcal', '2075 kcal', 'Normal'));
    expect(html).toContain(row('Relação cintura/quadril', '0,84~0,91', '0,97', 'Risco Muito Alto'));
    expect(html).toContain(row('Pressão arterial', '120/80 mmHg', '130/80 mmHg', 'Pré-hipertensão'));
    // Números do relatório saem com vírgula.
    expect(html).not.toContain('107.7 kg');
    expect(html).toContain('Massa gorda: 24,5%'); // legenda da pizza
  });

  it('dobras trazem só os locais de dobra — identificadores do registro nunca vão para o relatório', () => {
    // O serviço entrega o registro como veio do banco, com id e evaluationId junto das medidas.
    const rawRow = { id: '512046f4-f79c-4f46-9758-841aa581b3b8', evaluationId: '8679070d-c115-4631-99ba-5666ab12dc4f', ...core.skinfolds! };
    const data = { ...core, generatedAt: '2026-01-15T00:00:00Z', skinfolds: rawRow } as ProfessionalEvaluationReportData;
    const html = renderProfessionalReportHtml(data);
    expect(html).toContain('Tórax: 8 mm');
    expect(html).not.toContain('512046f4');
    expect(html).not.toContain('8679070d');
    expect(html).not.toContain('evaluationId');
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

    // peso, % e água (página 2) → cartão de valor único (3); as 2 pizzas usam o
    // instantâneo atual, não a série, então continuam aparecendo normalmente.
    // Na página 3, tronco e pressão marcam o ponto único (sem linha) e as barras
    // desenham a coluna da avaliação.
    expect(countOccurrences(html, 'class="chart-single-value"')).toBe(3);
    expect(html.match(/<svg[^>]*class="chart-svg"/g)?.length).toBe(2);
    expect(html).not.toContain('<path d=');
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
    expect(countOccurrences(html, 'class="chart-single-value"')).toBe(3);
    expect(html.match(/<svg[^>]*class="pie-chart-svg"/g)?.length).toBe(2);
    expect(html).toContain('Sem dados suficientes para este gráfico.'); // página 3 sem medidas registradas
  });

  it('página 3 mostra medidas de tronco, membros e dobras; sem fotos, a página 4 não é gerada', () => {
    const data: ProfessionalEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z', photos: [] };
    const html = renderProfessionalReportHtml(data);

    expect(html).toContain('Evolução das medidas');
    for (const title of ['Idade corporal', 'Medidas do tronco', 'Membros superiores', 'Membros inferiores', 'Pressão arterial', 'Dobras cutâneas']) {
      expect(html).toContain(`<h3 class="chart-title">${title}</h3>`);
    }
    // Membros e dobras em barras empilhadas; a soma das 7 dobras atuais (8+10+12+9+15+11+14) no topo da coluna.
    expect(html.match(/<svg[^>]*class="chart-svg bar-chart-svg"/g)?.length).toBe(4); // idade, superiores, inferiores, dobras
    expect(html).toContain('font-weight="700">79</text>');
    // Valores atuais na legenda, com vírgula.
    expect(html).toContain('Braço esq.: 27,5 cm');
    expect(html).toContain('Panturrilha esq.: 33,5 cm');
    expect(html).toContain('Abdominal: 15 mm');
    // Pressão com as linhas de referência.
    expect(html).toContain('Sistólica até 120');
    expect(html).toContain('Diastólica até 80');
    // Fontes das faixas de referência no fim.
    expect(html).toContain('Fontes: peso de referência e IMC — Organização Mundial da Saúde');
    // As tabelas antigas (atual/anterior/variação) saíram.
    expect(html).not.toContain('<th class="num">Anterior</th>');
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
