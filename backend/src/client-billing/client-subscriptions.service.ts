import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientBillingAuditAction, ClientSubscription, ClientSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';

export interface RequestMeta {
  ipAddress?: string;
}

export type ApplyGatewayStatusResult =
  | { outcome: 'applied' | 'unchanged' | 'conflict'; subscription: ClientSubscription }
  | { outcome: 'unknown_status' | 'not_found' };

/**
 * Criação não faz parte desta fase: uma ClientSubscription só passa a
 * existir depois que o cliente autoriza no gateway (webhook, Fase 23.5).
 * Aqui só leitura e cancelamento — mesmo padrão de `cancelAtPeriodEnd` já
 * usado por SubscriptionsService (Fase 22, SaaS): nunca corta acesso na
 * hora, só marca para não renovar no fim do período atual.
 */
@Injectable()
export class ClientSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: ClientBillingAuditLogService,
  ) {}

  async listForProfessional(professionalId: string, clientId?: string): Promise<ClientSubscription[]> {
    return this.prisma.clientSubscription.findMany({
      where: { professionalId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForClient(clientId: string): Promise<ClientSubscription[]> {
    return this.prisma.clientSubscription.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  private async assertOwnedByProfessional(professionalId: string, id: string): Promise<ClientSubscription> {
    const subscription = await this.prisma.clientSubscription.findFirst({ where: { id, professionalId } });
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada.');
    }
    return subscription;
  }

  private async assertOwnedByClient(clientId: string, id: string): Promise<ClientSubscription> {
    const subscription = await this.prisma.clientSubscription.findFirst({ where: { id, clientId } });
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada.');
    }
    return subscription;
  }

  private async cancel(subscription: ClientSubscription, meta: RequestMeta): Promise<ClientSubscription> {
    if (subscription.status === ClientSubscriptionStatus.cancelled || subscription.cancelAtPeriodEnd) {
      return subscription;
    }
    const updated = await this.prisma.clientSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
    await this.auditLog.record({
      professionalId: subscription.professionalId,
      clientId: subscription.clientId,
      clientSubscriptionId: subscription.id,
      action: ClientBillingAuditAction.subscription_canceled,
      metadata: { effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null },
      ipAddress: meta.ipAddress,
    });
    return updated;
  }

  async cancelForProfessional(professionalId: string, id: string, meta: RequestMeta = {}): Promise<ClientSubscription> {
    const subscription = await this.assertOwnedByProfessional(professionalId, id);
    return this.cancel(subscription, meta);
  }

  async cancelForClient(clientId: string, id: string, meta: RequestMeta = {}): Promise<ClientSubscription> {
    const subscription = await this.assertOwnedByClient(clientId, id);
    return this.cancel(subscription, meta);
  }

  async findByExternalSubscriptionId(externalSubscriptionId: string): Promise<ClientSubscription | null> {
    return this.prisma.clientSubscription.findUnique({ where: { externalSubscriptionId } });
  }

  /**
   * Autorização confirmada pelo webhook (Fase 23.5) — só aqui uma
   * ClientSubscription nasce de verdade. Idempotente via `upsert` nativo
   * sobre `externalSubscriptionId` (@unique): dois webhooks "authorized"
   * para o mesmo preapproval (reentrega/concorrência) nunca criam duas
   * linhas.
   */
  async activateFromWebhook(
    params: {
      professionalId: string;
      clientId: string;
      professionalProductId: string;
      paymentLinkId?: string;
      externalSubscriptionId: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    },
    meta: RequestMeta = {},
  ): Promise<ClientSubscription> {
    const subscription = await this.prisma.clientSubscription.upsert({
      where: { externalSubscriptionId: params.externalSubscriptionId },
      create: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        professionalProductId: params.professionalProductId,
        paymentLinkId: params.paymentLinkId,
        externalSubscriptionId: params.externalSubscriptionId,
        status: ClientSubscriptionStatus.authorized,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
      update: {
        status: ClientSubscriptionStatus.authorized,
      },
    });

    await this.auditLog.record({
      professionalId: params.professionalId,
      clientId: params.clientId,
      paymentLinkId: params.paymentLinkId,
      clientSubscriptionId: subscription.id,
      action: ClientBillingAuditAction.subscription_authorized,
      metadata: { externalSubscriptionId: params.externalSubscriptionId },
      ipAddress: meta.ipAddress,
    });

    return subscription;
  }

  /**
   * Aplica em uma ClientSubscription JÁ EXISTENTE o estado que o gateway
   * acabou de confirmar (Fase 23.6) — lógica única compartilhada pelo
   * webhook (Fase 23.5) e pela reconciliação automática. Não conhece HTTP
   * nem o gateway: recebe o status já consultado.
   *
   * - Nunca cria (só uma assinatura já autorizada em nosso sistema pode
   *   mudar de estado); inexistente -> `not_found`.
   * - Status do gateway fora de authorized/paused/cancelled não vira
   *   transição nenhuma (`unknown_status`) — nunca é interpretado como
   *   cancelamento.
   * - Idempotente e seguro sob concorrência: `updateMany` condicional em
   *   `status != alvo`; só quem de fato mudou a linha audita, então
   *   reexecuções/entregas repetidas/dois workers não duplicam auditoria.
   * - `expectedLocalStatus` (usado pela reconciliação) é um lock
   *   otimista: se o estado local mudou entre a leitura e a escrita
   *   (ex.: um webhook mais novo), NÃO sobrescreve com dado possivelmente
   *   velho (`conflict`) — a próxima execução reavalia.
   */
  async applyGatewayStatus(
    params: {
      externalSubscriptionId: string;
      gatewayStatus: string;
      source: 'webhook' | 'reconciliation';
      expectedLocalStatus?: ClientSubscriptionStatus;
    },
    meta: RequestMeta = {},
  ): Promise<ApplyGatewayStatusResult> {
    const target = this.mapGatewayStatus(params.gatewayStatus);
    if (!target) {
      return { outcome: 'unknown_status' };
    }

    const { count } = await this.prisma.clientSubscription.updateMany({
      where: {
        externalSubscriptionId: params.externalSubscriptionId,
        status: { not: target },
        ...(params.expectedLocalStatus ? { AND: [{ status: params.expectedLocalStatus }] } : {}),
      },
      data: {
        status: target,
        ...(target === ClientSubscriptionStatus.cancelled ? { canceledAt: new Date() } : {}),
      },
    });

    const subscription = await this.prisma.clientSubscription.findUnique({
      where: { externalSubscriptionId: params.externalSubscriptionId },
    });
    if (!subscription) {
      return { outcome: 'not_found' };
    }
    if (count === 0) {
      return { outcome: subscription.status === target ? 'unchanged' : 'conflict', subscription };
    }

    await this.auditLog.record({
      professionalId: subscription.professionalId,
      clientId: subscription.clientId,
      paymentLinkId: subscription.paymentLinkId ?? undefined,
      clientSubscriptionId: subscription.id,
      action: this.auditActionFor(target),
      metadata: { externalSubscriptionId: params.externalSubscriptionId, source: params.source },
      ipAddress: meta.ipAddress,
    });

    return { outcome: 'applied', subscription };
  }

  private mapGatewayStatus(gatewayStatus: string): ClientSubscriptionStatus | null {
    switch (gatewayStatus) {
      case 'authorized':
        return ClientSubscriptionStatus.authorized;
      case 'paused':
        return ClientSubscriptionStatus.paused;
      case 'cancelled':
        return ClientSubscriptionStatus.cancelled;
      default:
        return null;
    }
  }

  private auditActionFor(status: ClientSubscriptionStatus): ClientBillingAuditAction {
    if (status === ClientSubscriptionStatus.authorized) return ClientBillingAuditAction.subscription_authorized;
    if (status === ClientSubscriptionStatus.paused) return ClientBillingAuditAction.subscription_paused;
    return ClientBillingAuditAction.subscription_canceled;
  }
}
