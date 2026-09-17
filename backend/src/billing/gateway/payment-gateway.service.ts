import { PlanInterval } from '@prisma/client';

export interface GatewayCustomer {
  gatewayCustomerId: string;
}

export interface GatewaySubscription {
  gatewaySubscriptionId: string;
}

export interface GatewayCharge {
  gatewayInvoiceId: string;
  paid: boolean;
}

/**
 * Abstração de gateway de pagamento — mesmo padrão de EmailService (Fase
 * 13) e StorageService (Fase 9): BillingService depende só desta
 * interface, nunca de um provedor concreto. Qual gateway usar (Stripe,
 * Pagar.me, Asaas, Mercado Pago...) é decisão de negócio do usuário —
 * cada um tem API própria, não existe um protocolo padrão único como o
 * S3 tem para object storage, então não há como pré-integrar um real
 * sem uma conta configurada. A única implementação registrada é
 * MockPaymentGatewayService: simula o ciclo de vida completo (cliente,
 * assinatura, cobrança, webhook assinado) localmente, sem nenhuma
 * cobrança real acontecer.
 */
export abstract class PaymentGatewayService {
  abstract createCustomer(professionalId: string, email: string): Promise<GatewayCustomer>;
  abstract createSubscription(gatewayCustomerId: string, planCode: string): Promise<GatewaySubscription>;
  abstract cancelSubscription(gatewaySubscriptionId: string): Promise<void>;
  abstract charge(gatewaySubscriptionId: string, amountCents: number): Promise<GatewayCharge>;
  abstract nextPeriodEnd(from: Date, interval: PlanInterval): Date;

  /** Assina um payload de webhook (usado pelo simulador de ciclo de cobrança para se auto-chamar). */
  abstract signWebhookPayload(rawBody: string): string;
  /** Verifica a assinatura de um webhook recebido — HMAC-SHA256 com comparação em tempo constante. */
  abstract verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
