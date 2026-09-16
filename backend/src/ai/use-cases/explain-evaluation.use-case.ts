import { Injectable, NotFoundException } from '@nestjs/common';
import { AiFeatureKey } from '@prisma/client';
import { PhysicalEvaluationsService } from '../../physical-evaluations/physical-evaluations.service';
import type { AiContextResult, AiUseCase, BuildContextParams } from './ai-use-case.interface';

const SYSTEM_PROMPT =
  'Você explica, em linguagem simples, os números de uma avaliação física de um cliente que já foi liberada ' +
  'pelo profissional responsável. Descreva só os valores fornecidos no contexto, na ordem em que aparecem. ' +
  'Não diagnostique, não interprete além do que os números mostram, não recomende tratamento, dieta ou treino. ' +
  'Se um valor não estiver no contexto, não mencione nem estime esse valor.';

interface ExplainEvaluationInput {
  evaluationId: string;
}

/**
 * Funcionalidade B do design aprovado. Reaproveita EXATAMENTE o mapper já
 * usado pelo app do cliente (Fase 8, `getReleasedSummaryForClient`) — o
 * mesmo allowlist client-safe, não um novo. Devolve null (→ 404) quando a
 * avaliação não existe, não é deste cliente, ou ainda não foi liberada:
 * a IA nunca vê uma avaliação não liberada, em nenhuma hipótese.
 */
@Injectable()
export class ExplainEvaluationUseCase implements AiUseCase {
  readonly feature = AiFeatureKey.explain_evaluation;
  readonly promptVersion = 'explain_evaluation@v1';

  constructor(private readonly evaluations: PhysicalEvaluationsService) {}

  async buildContext({ clientId, input }: BuildContextParams): Promise<AiContextResult> {
    const { evaluationId } = input as ExplainEvaluationInput;
    const summary = await this.evaluations.getReleasedSummaryForClient(clientId, evaluationId);
    if (!summary) {
      throw new NotFoundException('Avaliação não encontrada ou ainda não liberada ao cliente.');
    }

    return {
      systemPrompt: SYSTEM_PROMPT,
      context: {
        evaluatedAt: summary.evaluatedAt,
        weightKg: summary.weightKg,
        bmi: summary.bmi,
        bmiClassification: summary.bmiClassification,
        bodyFatPercent: summary.bodyFatPercent,
        fatMassKg: summary.fatMassKg,
        leanMassKg: summary.leanMassKg,
        measurements: summary.measurements,
        composition: summary.composition,
      },
      contextRef: evaluationId,
    };
  }
}
