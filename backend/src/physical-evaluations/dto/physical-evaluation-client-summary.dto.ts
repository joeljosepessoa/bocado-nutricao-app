/**
 * Subconjunto seguro de uma avaliação física para eventual exposição ao
 * próprio cliente — sem rota nesta fase (isso é Fase 8, "Evolução").
 * Existe agora só para provar, com teste dedicado, que o backend já é
 * capaz de produzir uma visão sem dado técnico: nunca dobras, medidas
 * brutas, bioimpedância, notas clínicas ou payload de balança.
 */
export class PhysicalEvaluationClientSummaryDto {
  id!: string;
  evaluatedAt!: Date;
  weightKg!: number | null;
  bmiClassification!: string | null;

  static fromEvaluation(evaluation: {
    id: string;
    evaluatedAt: Date;
    weightKg: number | null;
    calculatedMetrics: { bmiClassification: string | null } | null;
  }): PhysicalEvaluationClientSummaryDto {
    const dto = new PhysicalEvaluationClientSummaryDto();
    dto.id = evaluation.id;
    dto.evaluatedAt = evaluation.evaluatedAt;
    dto.weightKg = evaluation.weightKg;
    dto.bmiClassification = evaluation.calculatedMetrics?.bmiClassification ?? null;
    return dto;
  }
}
