import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientBillingAuditAction, ClientSubscription, ClientSubscriptionStatus } from '@prisma/client';
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
}
