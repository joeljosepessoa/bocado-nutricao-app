/**
 * Subconjunto seguro de uma avaliação física para exposição ao próprio
 * cliente (Fase 7 criou a rota `/client/evolution` com 4 campos; Fase 8
 * amplia o conteúdo) — só quando explicitamente liberada pelo profissional
 * (`releasedToClientAt`, filtrado na query do serviço que monta a lista,
 * nunca só aqui no mapper).
 *
 * Allowlist fechado por decisão explícita da Fase 8: composição corporal
 * (peso, IMC, %gordura, massa gorda/magra) e todos os RESULTADOS de
 * bioimpedância já armazenados, mais as 13 circunferências. Nunca dobras
 * em mm, protocolo/fórmula, pressão, glicemia, notas, dado bruto de
 * bioimpedância (`impedanceData`/`segmentalData`), fotos ou auditoria —
 * essas nunca fazem parte do shape de entrada do mapper abaixo.
 */
export interface EvolutionMeasurementsClientView {
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

export interface EvolutionCompositionClientView {
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  boneMassKg: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
}

export class PhysicalEvaluationClientSummaryDto {
  id!: string;
  evaluatedAt!: Date;
  weightKg!: number | null;
  bmi!: number | null;
  bmiClassification!: string | null;
  bodyFatPercent!: number | null;
  fatMassKg!: number | null;
  leanMassKg!: number | null;
  measurements!: EvolutionMeasurementsClientView | null;
  composition!: EvolutionCompositionClientView | null;

  static fromEvaluation(evaluation: {
    id: string;
    evaluatedAt: Date;
    weightKg: number | null;
    calculatedMetrics: {
      bmi: number | null;
      bmiClassification: string | null;
      bodyFatPercent: number | null;
      fatMassKg: number | null;
      leanMassKg: number | null;
    } | null;
    measurements: {
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
    } | null;
    bioimpedance: {
      muscleMassKg: number | null;
      skeletalMuscleMassKg: number | null;
      bodyWaterPercent: number | null;
      visceralFatLevel: number | null;
      boneMassKg: number | null;
      basalMetabolicRateKcal: number | null;
      bodyAgeYears: number | null;
    } | null;
  }): PhysicalEvaluationClientSummaryDto {
    const dto = new PhysicalEvaluationClientSummaryDto();
    dto.id = evaluation.id;
    dto.evaluatedAt = evaluation.evaluatedAt;
    dto.weightKg = evaluation.weightKg;
    dto.bmi = evaluation.calculatedMetrics?.bmi ?? null;
    dto.bmiClassification = evaluation.calculatedMetrics?.bmiClassification ?? null;
    dto.bodyFatPercent = evaluation.calculatedMetrics?.bodyFatPercent ?? null;
    dto.fatMassKg = evaluation.calculatedMetrics?.fatMassKg ?? null;
    dto.leanMassKg = evaluation.calculatedMetrics?.leanMassKg ?? null;

    dto.measurements = evaluation.measurements
      ? {
          chestCm: evaluation.measurements.chestCm,
          waistCm: evaluation.measurements.waistCm,
          abdomenCm: evaluation.measurements.abdomenCm,
          hipCm: evaluation.measurements.hipCm,
          armRightCm: evaluation.measurements.armRightCm,
          armLeftCm: evaluation.measurements.armLeftCm,
          forearmRightCm: evaluation.measurements.forearmRightCm,
          forearmLeftCm: evaluation.measurements.forearmLeftCm,
          thighRightCm: evaluation.measurements.thighRightCm,
          thighLeftCm: evaluation.measurements.thighLeftCm,
          calfRightCm: evaluation.measurements.calfRightCm,
          calfLeftCm: evaluation.measurements.calfLeftCm,
          wristCm: evaluation.measurements.wristCm,
          femurBicondylarCm: evaluation.measurements.femurBicondylarCm,
        }
      : null;

    dto.composition = evaluation.bioimpedance
      ? {
          muscleMassKg: evaluation.bioimpedance.muscleMassKg,
          skeletalMuscleMassKg: evaluation.bioimpedance.skeletalMuscleMassKg,
          bodyWaterPercent: evaluation.bioimpedance.bodyWaterPercent,
          visceralFatLevel: evaluation.bioimpedance.visceralFatLevel,
          boneMassKg: evaluation.bioimpedance.boneMassKg,
          basalMetabolicRateKcal: evaluation.bioimpedance.basalMetabolicRateKcal,
          bodyAgeYears: evaluation.bioimpedance.bodyAgeYears,
        }
      : null;

    return dto;
  }
}
