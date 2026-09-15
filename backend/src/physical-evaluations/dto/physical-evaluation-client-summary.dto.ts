/**
 * Subconjunto seguro de uma avaliação física para exposição ao próprio
 * cliente (Fase 7, rota `/client/evolution`) — só quando explicitamente
 * liberada pelo profissional (`releasedToClientAt`, checado pelo serviço
 * que monta a lista, não por este mapper). Nunca dobras, medidas brutas,
 * bioimpedância completa, notas clínicas ou payload de balança — só os
 * quatro indicadores abaixo, sempre um allowlist fechado.
 */
export class PhysicalEvaluationClientSummaryDto {
  id!: string;
  evaluatedAt!: Date;
  weightKg!: number | null;
  bmiClassification!: string | null;
  bodyFatPercent!: number | null;
  leanMassKg!: number | null;

  static fromEvaluation(evaluation: {
    id: string;
    evaluatedAt: Date;
    weightKg: number | null;
    calculatedMetrics: { bmiClassification: string | null; bodyFatPercent: number | null; leanMassKg: number | null } | null;
  }): PhysicalEvaluationClientSummaryDto {
    const dto = new PhysicalEvaluationClientSummaryDto();
    dto.id = evaluation.id;
    dto.evaluatedAt = evaluation.evaluatedAt;
    dto.weightKg = evaluation.weightKg;
    dto.bmiClassification = evaluation.calculatedMetrics?.bmiClassification ?? null;
    dto.bodyFatPercent = evaluation.calculatedMetrics?.bodyFatPercent ?? null;
    dto.leanMassKg = evaluation.calculatedMetrics?.leanMassKg ?? null;
    return dto;
  }
}
