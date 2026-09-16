import type { SkinfoldsMmFields } from '../../physical-evaluations/dto/evolution-point.dto';

export const CURRENT_TEMPLATE_VERSION = 1;

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
  heightCm: number;
  weightKg: number | null;
  bmi: number | null;
  bmiClassification: string | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  measurements: ReportMeasurements | null;
  composition: ReportComposition | null;
  comparison: ReportComparison | null;
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
}

export interface ProfessionalEvaluationReportData extends EvaluationReportCore, EvaluationReportTechnicalExtras {
  generatedAt: string;
}

export interface ClientEvaluationReportData extends EvaluationReportCore {
  generatedAt: string;
}
