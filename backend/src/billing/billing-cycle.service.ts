import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingAuditAction, InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { BillingAuditLogService } from './billing-audit-log.service';

/**
 * Simula o que um webhook de gateway real dispararia (fim de trial cobra
 * a primeira fatura; fim de período renova ou cancela) — mesmo raciocínio
 * de AppointmentReminderService (Fase 18): @nestjs/schedule, sem fila/
 * broker externo, `processDueBilling` público e chamável direto pelos
 * testes sem esperar o agendamento real. Quando um gateway real for
 * conectado, os webhooks dele assumem este papel; este cron continua
 * sendo o fallback/reconciliação (padrão comum mesmo com gateway real).
 */
@Injectable()
export class BillingCycleService {
  private readonly logger = new Logger(BillingCycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly auditLog: BillingAuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processDueBilling(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.trialing, SubscriptionStatus.active] },
        currentPeriodEnd: { lte: now },
      },
      include: { plan: true },
    });

    for (const subscription of due) {
      try {
        if (subscription.cancelAtPeriodEnd) {
          await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.canceled, canceledAt: now },
          });
          await this.auditLog.record({
            professionalId: subscription.professionalId,
            subscriptionId: subscription.id,
            action: BillingAuditAction.subscription_canceled,
          });
          continue;
        }

        const charge = await this.gateway.charge(subscription.gatewaySubscriptionId ?? subscription.id, subscription.plan.priceCents);
        const nextPeriodEnd = this.gateway.nextPeriodEnd(subscription.currentPeriodEnd, subscription.plan.interval);

        await this.prisma.invoice.create({
          data: {
            subscriptionId: subscription.id,
            amountCents: subscription.plan.priceCents,
            status: charge.paid ? InvoiceStatus.paid : InvoiceStatus.failed,
            dueDate: subscription.currentPeriodEnd,
            paidAt: charge.paid ? now : null,
            gatewayInvoiceId: charge.gatewayInvoiceId,
          },
        });

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: charge.paid
            ? { status: SubscriptionStatus.active, currentPeriodStart: subscription.currentPeriodEnd, currentPeriodEnd: nextPeriodEnd }
            : { status: SubscriptionStatus.past_due },
        });

        await this.auditLog.record({
          professionalId: subscription.professionalId,
          subscriptionId: subscription.id,
          action: charge.paid ? BillingAuditAction.subscription_renewed : BillingAuditAction.invoice_failed,
          metadata: { amountCents: subscription.plan.priceCents },
        });
      } catch (err) {
        this.logger.error(`Falha ao processar cobrança da assinatura ${subscription.id}`, err as Error);
      }
    }
  }
}
