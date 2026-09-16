import { BadRequestException, Injectable } from '@nestjs/common';
import { AiFeatureKey } from '@prisma/client';
import { PhysicalEvaluationsService } from '../../physical-evaluations/physical-evaluations.service';
import { computeDeterministicTrend, daysBetween } from './compute-deterministic-trend';
import type { AiContextResult, AiUseCase, BuildContextParams } from './ai-use-case.interface';

const SYSTEM_PROMPT =
  'Você recebe uma tendência JÁ CALCULADA (não recalcule, não invente valores) entre as duas avaliações ' +
  'liberadas mais recentes de um cliente. Descreva essa tendência em linguagem simples e neutra, métrica por ' +
  'métrica, usando só os números do contexto. Não diagnostique, não interprete causa, não recomende tratamento, ' +
  'dieta ou treino. Se a lista de métricas estiver vazia, diga que não há tendência para descrever — nunca invente uma.';

/**
 * Funcionalidade C do design aprovado. O cálculo em si (computeDeterministicTrend)
 * roda em código comum, não na IA — a IA só recebe o resultado já pronto.
 * Reaproveita listReleasedForClient (Fase 8) para as duas avaliações mais
 * recentes já liberadas; nunca usa avaliação não liberada.
 */
@Injectable()
export class NarrateTrendUseCase implements AiUseCase {
  readonly feature = AiFeatureKey.narrate_trend;
  readonly promptVersion = 'narrate_trend@v1';

  constructor(private readonly evaluations: PhysicalEvaluationsService) {}

  async buildContext({ clientId }: BuildContextParams): Promise<AiContextResult> {
    const { items } = await this.evaluations.listReleasedForClient(clientId, 1, 2);
    if (items.length < 2) {
      throw new BadRequestException('Ainda não há avaliações liberadas suficientes para calcular uma tendência.');
    }

    // listReleasedForClient ordena por evaluatedAt desc — items[0] é a mais recente.
    const [current, previous] = items;
    const metrics = computeDeterministicTrend(previous, current);
    if (metrics.length === 0) {
      throw new BadRequestException('Nenhuma métrica comparável entre as duas avaliações mais recentes.');
    }

    return {
      systemPrompt: SYSTEM_PROMPT,
      context: {
        periodDays: daysBetween(previous.evaluatedAt, current.evaluatedAt),
        metrics,
      },
    };
  }
}
