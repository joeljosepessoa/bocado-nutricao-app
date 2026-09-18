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

// Domínio deliberadamente separado do Billing SaaS (Fase 23.1/23.2) —
// importa BillingModule só para reaproveitar o PaymentGatewayService/
// MockPaymentGatewayService já exportados de lá (mesma instância de
// gateway, "manter a arquitetura PaymentLinksService → PaymentGatewayService
// → MockPaymentGatewayService"), nunca para reaproveitar Plan/Subscription/
// Invoice/BillingAuditLog/BillingCycleService.
@Module({
  imports: [BillingModule],
  controllers: [
    ProfessionalProductsController,
    PaymentLinksController,
    ClientSubscriptionsController,
    ClientInvoicesController,
  ],
  providers: [
    ProfessionalProductsService,
    PaymentLinksService,
    ClientSubscriptionsService,
    ClientInvoicesService,
    ClientBillingAuditLogService,
  ],
  exports: [ProfessionalProductsService, PaymentLinksService, ClientSubscriptionsService, ClientInvoicesService],
})
export class ClientBillingModule {}
