import { BioimpedanceOrigin, BodyFatSource } from '@prisma/client';

export interface SkinfoldsMmFields {
  chestMm: number | null;
  axillaryMidMm: number | null;
  subscapularMm: number | null;
  bicepsMm: number | null;
  tricepsMm: number | null;
  abdominalMm: number | null;
  suprailiacMm: number | null;
  thighMm: number | null;
  calfMm: number | null;
}

const SKINFOLD_FIELD_BY_SITE: Record<string, keyof SkinfoldsMmFields> = {
  chest: 'chestMm',
  axillaryMid: 'axillaryMidMm',
  subscapular: 'subscapularMm',
  biceps: 'bicepsMm',
  triceps: 'tricepsMm',
  abdominal: 'abdominalMm',
  suprailiac: 'suprailiacMm',
  thigh: 'thighMm',
  calf: 'calfMm',
};

/**
 * Soma bruta das dobras exigidas pelo protocolo *daquela* avaliação — nunca
 * recalculada com o protocolo atual. Sem protocolo definido, ou com
 * qualquer dobra exigida faltando, devolve null em vez de somar um
 * subconjunto arbitrário (mesma filosofia de "nunca estimar com dado
 * parcial" usada em CalculationService.computeJacksonPollock7Percent).
 */
export function computeSkinfoldSumMm(
  requiredSites: string[] | null | undefined,
  skinfolds: SkinfoldsMmFields | null | undefined,
): number | null {
  if (!requiredSites?.length || !skinfolds) {
    return null;
  }
  let sum = 0;
  for (const site of requiredSites) {
    const field = SKINFOLD_FIELD_BY_SITE[site];
    const value = field ? skinfolds[field] : null;
    if (value == null) {
      return null;
    }
    sum += value;
  }
  return Math.round(sum * 100) / 100;
}

export interface EvolutionMeasurementsPoint {
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

export interface EvolutionBioimpedancePoint {
  origin: BioimpedanceOrigin;
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  boneMassKg: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
}

/**
 * Um ponto por avaliação, pensado para desenhar gráficos no painel
 * profissional — leve (sem fotos, sem notas, sem protocolo por extenso) e
 * técnico completo (dobras, bioimpedância bruta de resultado incluídas;
 * este DTO nunca é enviado ao cliente).
 */
export class EvolutionPointDto {
  id!: string;
  evaluatedAt!: Date;
  releasedToClientAt!: Date | null;

  weightKg!: number | null;
  bmi!: number | null;
  bmiClassification!: string | null;
  bodyFatPercent!: number | null;
  bodyFatPercentSource!: BodyFatSource | null;
  fatMassKg!: number | null;
  leanMassKg!: number | null;

  measurements!: EvolutionMeasurementsPoint | null;

  skinfoldSumMm!: number | null;
  protocolCode!: string | null;
  protocolVersion!: number | null;

  bioimpedance!: EvolutionBioimpedancePoint | null;

  static fromEvaluation(evaluation: {
    id: string;
    evaluatedAt: Date;
    releasedToClientAt: Date | null;
    weightKg: number | null;
    calculatedMetrics: {
      bmi: number | null;
      bmiClassification: string | null;
      bodyFatPercent: number | null;
      bodyFatPercentSource: BodyFatSource | null;
      fatMassKg: number | null;
      leanMassKg: number | null;
    } | null;
    measurements: EvolutionMeasurementsPoint | null;
    skinfolds: SkinfoldsMmFields | null;
    protocol: { code: string; version: number; requiredSkinfoldSites: string[] } | null;
    bioimpedance: EvolutionBioimpedancePoint | null;
  }): EvolutionPointDto {
    const dto = new EvolutionPointDto();
    dto.id = evaluation.id;
    dto.evaluatedAt = evaluation.evaluatedAt;
    dto.releasedToClientAt = evaluation.releasedToClientAt;

    dto.weightKg = evaluation.weightKg;
    dto.bmi = evaluation.calculatedMetrics?.bmi ?? null;
    dto.bmiClassification = evaluation.calculatedMetrics?.bmiClassification ?? null;
    dto.bodyFatPercent = evaluation.calculatedMetrics?.bodyFatPercent ?? null;
    dto.bodyFatPercentSource = evaluation.calculatedMetrics?.bodyFatPercentSource ?? null;
    dto.fatMassKg = evaluation.calculatedMetrics?.fatMassKg ?? null;
    dto.leanMassKg = evaluation.calculatedMetrics?.leanMassKg ?? null;

    dto.measurements = evaluation.measurements;
    dto.skinfoldSumMm = computeSkinfoldSumMm(evaluation.protocol?.requiredSkinfoldSites, evaluation.skinfolds);
    dto.protocolCode = evaluation.protocol?.code ?? null;
    dto.protocolVersion = evaluation.protocol?.version ?? null;
    dto.bioimpedance = evaluation.bioimpedance;

    return dto;
  }
}
