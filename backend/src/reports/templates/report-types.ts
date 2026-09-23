import type { SkinfoldsMmFields } from '../../physical-evaluations/dto/evolution-point.dto';

// v2 — redesenho completo do relatório profissional (4 páginas: resumo,
// gráficos de evolução, medidas/dobras, fotos) + gráficos de linha e
// rodapé com paginação real via Puppeteer footerTemplate.
export const CURRENT_TEMPLATE_VERSION = 2;

export interface ReportMeasurements {
  chestCm: number | null;
  waistCm: number | null;
  abdomenCm: number | null;
  hipCm: number | null;
  armRightCm: number | null;
  armLeftCm: number | null;
  forearmRightCm: number | null;
  forearmLeftCm: number | null;
  thighRightCm: number | null;
  thighLeftCm: number | null;
  calfRightCm: number | null;
  calfLeftCm: number | null;
  wristCm: number | null;
  femurBicondylarCm: number | null;
}

export interface ReportComposition {
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  boneMassKg: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
}

export interface ReportComparison {
  weightKg: number | null;
  bodyFatPercent: number | null;
  leanMassKg: number | null;
  fatMassKg: number | null;
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  /** Delta de massa muscular/esquelética como % do peso (massaKg/pesoKg×100 em cada ponta, depois a diferença) — derivado de dados reais, nunca uma referência externa. */
  musclePercent: number | null;
  skeletalMusclePercent: number | null;
  previousEvaluatedAt: string | null;
}

export interface ReportPhoto {
  angle: string;
  dataUri: string;
}

/** Núcleo comum às duas audiências — tudo aqui já é seguro para o cliente ver. */
export interface EvaluationReportCore {
  clientName: string;
  professionalName: string;
  evaluatedAt: string;
  ageAtEvaluation: number | null;
  biologicalSexForCalculation: 'male' | 'female' | null;
  heightCm: number;
  weightKg: number | null;
  bmi: number | null;
  bmiClassification: string | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  waistHipRatio: number | null;
  measurements: ReportMeasurements | null;
  composition: ReportComposition | null;
  comparison: ReportComparison | null;
}

/**
 * Um ponto por avaliação, só para os gráficos de evolução (página 2) e as
 * tabelas de medidas/dobras (página 3) do relatório PROFISSIONAL — nunca
 * serializado para o cliente. Ascendente (mais antiga primeiro).
 */
export interface ReportSeriesPoint {
  evaluatedAt: string;
  ageAtEvaluation: number | null;
  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyWaterPercent: number | null;
  bodyAgeYears: number | null;
  boneMassKg: number | null;
}

/** Valores da avaliação anterior usados só nas tabelas de evolução da página 3 (profissional). */
export interface ReportPreviousSnapshot {
  evaluatedAt: string;
  measurements: ReportMeasurements | null;
  skinfolds: SkinfoldsMmFields | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
}

/** Só o relatório profissional recebe isto — nunca serializado para o cliente. */
export interface EvaluationReportTechnicalExtras {
  bodyFatPercentSource: string | null;
  skinfolds: SkinfoldsMmFields | null;
  protocolLabel: string | null;
  bioimpedanceOrigin: string | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  glucose: number | null;
  notes: string | null;
  photos: ReportPhoto[];
  series: ReportSeriesPoint[];
  /** Avaliação imediatamente anterior — usada no comparativo "Último" e nas tabelas da página 3. */
  previous: ReportPreviousSnapshot | null;
  /** Primeira avaliação já registrada do cliente — usada no comparativo "Geral" (desde o início do acompanhamento). */
  first: ReportPreviousSnapshot | null;
  /** Delta acumulado desde a primeira avaliação (mesmos campos de `comparison`, que é sempre "desde a anterior"). */
  overallComparison: ReportComparison | null;
}

export interface ProfessionalEvaluationReportData extends EvaluationReportCore, EvaluationReportTechnicalExtras {
  generatedAt: string;
}

export interface ClientEvaluationReportData extends EvaluationReportCore {
  generatedAt: string;
}
