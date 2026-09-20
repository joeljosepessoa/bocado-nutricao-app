import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from '../billing/gateway/payment-gateway.service';
import { ClientSubscriptionsService } from './client-subscriptions.service';

export interface ReconciliationSummary {
  checked: number;
  applied: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

// `cancelled` é terminal (o Mercado Pago não reativa um preapproval
// cancelado) — não há o que reconciliar.
const ELIGIBLE_STATUSES: ClientSubscriptionStatus[] = [
  ClientSubscriptionStatus.pending,
  ClientSubscriptionStatus.authorized,
  ClientSubscriptionStatus.paused,
];

/**
 * Reconciliação automática de assinaturas recorrentes (Fase 23.6) —
 * recupera transições que o webhook possa ter perdido. Só trabalha com
 * ClientSubscription JÁ existentes (nunca cria uma a partir de um ID
 * externo); a fonte da verdade é sempre a consulta ao gateway via
 * PaymentGatewayService, nunca o que está gravado em PaymentLink; e quem
 * aplica a transição é a mesma lógica do webhook
 * (ClientSubscriptionsService.applyGatewayStatus).
 *
 * Falha do gateway nunca vira decisão comercial: o erro é logado, o
 * estado local fica intacto e a próxima execução tenta de novo.
 */
@Injectable()
export class ClientSubscriptionReconciliationService {
  private readonly logger = new Logger(ClientSubscriptionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly subscriptions: ClientSubscriptionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async reconcileSubscriptions(): Promise<ReconciliationSummary> {
    const summary: ReconciliationSummary = { checked: 0, applied: 0, unchanged: 0, skipped: 0, failed: 0 };

    let candidates;
    try {
      candidates = await this.prisma.clientSubscription.findMany({
        where: { status: { in: ELIGIBLE_STATUSES } },
        orderBy: { createdAt: 'asc' },
      });
    } catch (err) {
      this.logger.error('Falha ao listar assinaturas para reconciliação', err as Error);
      return summary;
    }

    for (const subscription of candidates) {
      if (!subscription.externalSubscriptionId) {
        summary.skipped++;
        continue;
      }

      summary.checked++;
      try {
        const remote = await this.gateway.getRecurringSubscription(subscription.externalSubscriptionId);

        // Integridade da resposta: tem que ser o mesmo recurso e, quando o
        // gateway devolve external_reference, tem que ser o NOSSO link.
        const sameResource = remote.externalId === subscription.externalSubscriptionId;
        const sameReference =
          !remote.externalReference || !subscription.paymentLinkId || remote.externalReference === subscription.paymentLinkId;
        if (!sameResource || !sameReference) {
          this.logger.warn(`Assinatura ${subscription.id}: resposta do gateway não corresponde ao registro local — ignorada.`);
          summary.skipped++;
          continue;
        }

        const result = await this.subscriptions.applyGatewayStatus({
          externalSubscriptionId: subscription.externalSubscriptionId,
          gatewayStatus: remote.status,
          source: 'reconciliation',
          expectedLocalStatus: subscription.status,
        });

        if (result.outcome === 'applied') {
          summary.applied++;
        } else if (result.outcome === 'unchanged') {
          summary.unchanged++;
        } else {
          // unknown_status (sem transição inventada), conflict (estado
          // local mudou no meio — reavalia na próxima execução) ou
          // not_found.
          summary.skipped++;
        }
      } catch (err) {
        summary.failed++;
        // Só a mensagem — nunca o objeto de resposta/headers do gateway.
        this.logger.error(`Falha ao reconciliar a assinatura ${subscription.id}: ${(err as Error).message}`);
      }
    }

    if (summary.applied > 0 || summary.failed > 0) {
      this.logger.log(
        `Reconciliação de assinaturas: ${summary.checked} verificada(s), ${summary.applied} atualizada(s), ${summary.failed} com falha.`,
      );
    }
    return summary;
  }
}
