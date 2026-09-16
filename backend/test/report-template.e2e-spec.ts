import { renderClientReportHtml, renderProfessionalReportHtml } from '../src/reports/templates/evaluation-report.template';
import type { ClientEvaluationReportData, ProfessionalEvaluationReportData } from '../src/reports/templates/report-types';

// Teste unitário puro (sem app Nest, sem banco, sem Puppeteer) — prova que
// o template do relatório cliente nunca serializa campo técnico algum,
// mesmo que os dados de origem carreguem tudo (dobras, protocolo, pressão,
// glicemia, notas, origem de bioimpedância) — allowlist da Fase 8/9.
describe('Templates de relatório (Fase 9)', () => {
  const core: Omit<ProfessionalEvaluationReportData, 'generatedAt'> = {
    clientName: 'Maria da Silva',
    professionalName: 'Dr. João Professional',
    evaluatedAt: '2026-01-01T00:00:00Z',
    ageAtEvaluation: 30,
    heightCm: 165,
    weightKg: 60,
    bmi: 22,
    bmiClassification: 'peso normal',
    bodyFatPercent: 20,
    fatMassKg: 12,
    leanMassKg: 48,
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
    comparison: { previousEvaluatedAt: '2025-10-01T00:00:00Z', weightKg: -2, bodyFatPercent: -1, leanMassKg: 1, fatMassKg: -1 },
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
  };

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

  it('relatório cliente não tem seção de fotos, mesmo que o profissional tenha (dados nunca chegam ao template cliente)', () => {
    const clientData: ClientEvaluationReportData = { ...core, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderClientReportHtml(clientData);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Fotos');
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

  it('quando não há comparação anterior, a seção de evolução não aparece', () => {
    const data: ClientEvaluationReportData = { ...core, comparison: null, generatedAt: '2026-01-15T00:00:00Z' };
    const html = renderClientReportHtml(data);
    expect(html).not.toContain('Evolução desde');
  });
});
