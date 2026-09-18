import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { MockPaymentGatewayService } from './gateway/mock-payment-gateway.service';
import { MercadoPagoPaymentGatewayService } from './gateway/mercadopago-payment-gateway.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { BillingAuditLogService } from './billing-audit-log.service';
import { BillingCycleService } from './billing-cycle.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';

const VALID_PROVIDERS = ['mock', 'mercadopago'] as const;

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    {
      provide: PaymentGatewayService,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('PAYMENT_GATEWAY_PROVIDER') ?? 'mock';
        if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
          // Falha explícita no boot — nunca cai silenciosamente para mock
          // por um valor digitado errado (Fase 23.4).
          throw new Error(
            `PAYMENT_GATEWAY_PROVIDER inválido: "${provider}". Use "mock" ou "mercadopago".`,
          );
        }
        return provider === 'mercadopago'
          ? new MercadoPagoPaymentGatewayService(config)
          : new MockPaymentGatewayService(config);
      },
      inject: [ConfigService],
    },
    PlansService,
    SubscriptionsService,
    BillingAuditLogService,
    BillingCycleService,
  ],
  exports: [SubscriptionsService, PaymentGatewayService],
})
export class BillingModule {}
