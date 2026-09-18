import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientBillingAuditAction, ClientSubscription, ClientSubscriptionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';

export interface RequestMeta {
  ipAddress?: string;
}

/**
 * Criação não faz parte desta fase: uma ClientSubscription só passa a
 * existir depois que o cliente autoriza no gateway (webhook, Fase 23.6+).
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
   * paused/cancelled reportados pelo webhook — nunca cria (só uma
   * assinatura já autorizada pode pausar/cancelar); se não existir,
   * devolve null (recurso externo desconhecido — quem chama decide como
   * tratar, sem inventar uma ClientSubscription do nada).
   */
  async applyStatusFromWebhook(
    externalSubscriptionId: string,
    status: typeof ClientSubscriptionStatus.paused | typeof ClientSubscriptionStatus.cancelled,
    meta: RequestMeta = {},
  ): Promise<ClientSubscription | null> {
    let subscription: ClientSubscription;
    try {
      subscription = await this.prisma.clientSubscription.update({
        where: { externalSubscriptionId },
        data: {
          status,
          ...(status === ClientSubscriptionStatus.cancelled ? { canceledAt: new Date() } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }

    await this.auditLog.record({
      professionalId: subscription.professionalId,
      clientId: subscription.clientId,
      clientSubscriptionId: subscription.id,
      action:
        status === ClientSubscriptionStatus.paused
          ? ClientBillingAuditAction.subscription_paused
          : ClientBillingAuditAction.subscription_canceled,
      metadata: { externalSubscriptionId },
      ipAddress: meta.ipAddress,
    });

    return subscription;
  }
}
