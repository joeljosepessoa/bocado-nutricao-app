import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ProfessionalProductsService } from './professional-products.service';
import { ProfessionalProductsController } from './professional-products.controller';
import { PaymentLinksService } from './payment-links.service';
import { PaymentLinksController } from './payment-links.controller';
import { ClientSubscriptionsService } from './client-subscriptions.service';
import { ClientSubscriptionsController } from './client-subscriptions.controller';
import { ClientInvoicesService } from './client-invoices.service';
import { ClientInvoicesController } from './client-invoices.controller';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';
import { MercadoPagoWebhookSignatureService } from './mercadopago-webhook-signature.service';
import { ClientBillingWebhookService } from './client-billing-webhook.service';
import { ClientBillingWebhookController } from './client-billing-webhook.controller';

// Domínio deliberadamente separado do Billing SaaS (Fase 23.1/23.2) —
// importa BillingModule só para reaproveitar o PaymentGatewayService/
// MockPaymentGatewayService já exportados de lá (mesma instância de
// gateway, "manter a arquitetura PaymentLinksService → PaymentGatewayService
// → MockPaymentGatewayService"), nunca para reaproveitar Plan/Subscription/
// Invoice/BillingAuditLog/BillingCycleService. O webhook (Fase 23.5)
// também mora aqui, separado de /billing/webhook (SaaS) — nunca o mesmo
// controller nem o mesmo esquema de assinatura.
@Module({
  imports: [BillingModule],
  controllers: [
    ProfessionalProductsController,
    PaymentLinksController,
    ClientSubscriptionsController,
    ClientInvoicesController,
    ClientBillingWebhookController,
  ],
  providers: [
    ProfessionalProductsService,
    PaymentLinksService,
    ClientSubscriptionsService,
    ClientInvoicesService,
    ClientBillingAuditLogService,
    MercadoPagoWebhookSignatureService,
    ClientBillingWebhookService,
  ],
  exports: [ProfessionalProductsService, PaymentLinksService, ClientSubscriptionsService, ClientInvoicesService],
})
export class ClientBillingModule {}
