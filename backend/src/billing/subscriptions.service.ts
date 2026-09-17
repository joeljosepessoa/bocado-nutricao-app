import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingAuditAction, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { BillingAuditLogService } from './billing-audit-log.service';

export interface RequestMeta {
  ipAddress?: string;
}

const SUBSCRIPTION_INCLUDE = {
  plan: true,
  invoices: { orderBy: { createdAt: 'desc' as const }, take: 20 },
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly auditLog: BillingAuditLogService,
  ) {}

  async getMine(professionalId: string) {
    return this.prisma.subscription.findUnique({
      where: { professionalId },
      include: SUBSCRIPTION_INCLUDE,
    });
  }

  async subscribe(professionalId: string, planCode: string, meta: RequestMeta = {}) {
    const existing = await this.prisma.subscription.findUnique({ where: { professionalId } });
    if (existing && existing.status !== SubscriptionStatus.canceled) {
      throw new ConflictException('Já existe uma assinatura ativa para esta conta.');
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.active) {
      throw new BadRequestException('Plano não encontrado.');
    }

    const professional = await this.prisma.professional.findUniqueOrThrow({
      where: { id: professionalId },
      select: { user: { select: { email: true } } },
    });

    const customer = await this.gateway.createCustomer(professionalId, professional.user.email);
    const gatewaySubscription = await this.gateway.createSubscription(customer.gatewayCustomerId, plan.code);

    const now = new Date();
    const hasTrial = plan.trialDays > 0;
    const currentPeriodEnd = hasTrial
      ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
      : this.gateway.nextPeriodEnd(now, plan.interval);

    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            planId: plan.id,
            status: hasTrial ? SubscriptionStatus.trialing : SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            gatewayCustomerId: customer.gatewayCustomerId,
            gatewaySubscriptionId: gatewaySubscription.gatewaySubscriptionId,
          },
          include: SUBSCRIPTION_INCLUDE,
        })
      : await this.prisma.subscription.create({
          data: {
            professionalId,
            planId: plan.id,
            status: hasTrial ? SubscriptionStatus.trialing : SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd,
            gatewayCustomerId: customer.gatewayCustomerId,
            gatewaySubscriptionId: gatewaySubscription.gatewaySubscriptionId,
          },
          include: SUBSCRIPTION_INCLUDE,
        });

    await this.auditLog.record({
      professionalId,
      subscriptionId: subscription.id,
      action: BillingAuditAction.subscription_started,
      metadata: { planCode: plan.code },
      ipAddress: meta.ipAddress,
    });

    return subscription;
  }

  async cancel(professionalId: string, meta: RequestMeta = {}) {
    const subscription = await this.prisma.subscription.findUnique({ where: { professionalId } });
    if (!subscription || subscription.status === SubscriptionStatus.canceled) {
      throw new NotFoundException('Nenhuma assinatura ativa encontrada.');
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
      include: SUBSCRIPTION_INCLUDE,
    });

    await this.auditLog.record({
      professionalId,
      subscriptionId: subscription.id,
      action: BillingAuditAction.subscription_canceled,
      metadata: { effectiveAt: updated.currentPeriodEnd.toISOString() },
      ipAddress: meta.ipAddress,
    });

    return updated;
  }

  /**
   * true se a conta tem uma assinatura em dia (trialing ou active) — é o
   * que um guard de "recurso exige plano pago" checa. past_due e canceled
   * não dão acesso.
   */
  async hasActiveAccess(professionalId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({ where: { professionalId } });
    if (!subscription) {
      return false;
    }
    return subscription.status === SubscriptionStatus.trialing || subscription.status === SubscriptionStatus.active;
  }
}
