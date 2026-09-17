import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanInterval } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  GatewayCharge,
  GatewayCustomer,
  GatewaySubscription,
  PaymentGatewayService,
} from './payment-gateway.service';

/**
 * Adapter padrão (dev/produção até um gateway real ser configurado) — não
 * fala com nenhuma rede, nunca processa dinheiro real. IDs `mock_*` deixam
 * claro, em qualquer log/painel, que aquela cobrança nunca aconteceu de
 * verdade. A assinatura de webhook (HMAC-SHA256) é real e funcional —
 * exatamente o esquema que Stripe/a maioria dos gateways usa — só a fonte
 * do evento é o nosso próprio simulador (ver BillingCycleService), não um
 * gateway externo.
 */
@Injectable()
export class MockPaymentGatewayService extends PaymentGatewayService {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private get secret(): string {
    return this.config.get<string>('PAYMENT_WEBHOOK_SECRET') || 'mock-webhook-secret-dev-only';
  }

  async createCustomer(professionalId: string, _email: string): Promise<GatewayCustomer> {
    return { gatewayCustomerId: `mock_cus_${createHash('sha256').update(professionalId).digest('hex').slice(0, 24)}` };
  }

  async createSubscription(_gatewayCustomerId: string, _planCode: string): Promise<GatewaySubscription> {
    return { gatewaySubscriptionId: `mock_sub_${randomUUID()}` };
  }

  async cancelSubscription(_gatewaySubscriptionId: string): Promise<void> {
    // Mock: nada para desfazer do lado do "gateway" — o estado que importa
    // é o da nossa própria tabela `subscriptions`.
  }

  async charge(_gatewaySubscriptionId: string, _amountCents: number): Promise<GatewayCharge> {
    // Mock sempre "aprova" — não há como simular recusa de cartão sem um
    // gateway real por trás.
    return { gatewayInvoiceId: `mock_inv_${randomUUID()}`, paid: true };
  }

  nextPeriodEnd(from: Date, interval: PlanInterval): Date {
    const next = new Date(from);
    if (interval === PlanInterval.year) {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  signWebhookPayload(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = Buffer.from(this.signWebhookPayload(rawBody), 'hex');
    const received = Buffer.from(signature, 'hex');
    if (expected.length !== received.length) {
      return false;
    }
    return timingSafeEqual(expected, received);
  }
}
