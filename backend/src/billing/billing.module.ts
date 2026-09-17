import { Module } from '@nestjs/common';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { MockPaymentGatewayService } from './gateway/mock-payment-gateway.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { BillingAuditLogService } from './billing-audit-log.service';
import { BillingCycleService } from './billing-cycle.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    { provide: PaymentGatewayService, useClass: MockPaymentGatewayService },
    PlansService,
    SubscriptionsService,
    BillingAuditLogService,
    BillingCycleService,
  ],
  exports: [SubscriptionsService, PaymentGatewayService],
})
export class BillingModule {}
