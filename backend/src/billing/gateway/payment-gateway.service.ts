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

export interface CreateCheckoutParams {
  amountCents: number;
  description: string;
  /** Nosso próprio ID (ex.: PaymentLink.id), enviado ao gateway para correlacionar o retorno/webhook — mesmo papel do `external_reference` do Mercado Pago. */
  externalReference: string;
}

export interface GatewayCheckout {
  /** ID do recurso no gateway (preferência/checkout para pagamento único, preapproval/assinatura para recorrente). */
  externalId: string;
  /** URL de checkout a compartilhar com o cliente (ex.: `init_point`). */
  checkoutUrl: string;
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

  // --- Comercial cliente (Fase 23.3) — link de pagamento gerado pelo
  // profissional para cobrar o próprio cliente. Extensão mínima: só o
  // necessário para PaymentLinksService.create() funcionar ponta a ponta
  // contra o mock; nada de Mercado Pago real ainda (Fase 23.4+).
  abstract createOneTimeCheckout(params: CreateCheckoutParams): Promise<GatewayCheckout>;
  abstract createRecurringCheckout(params: CreateCheckoutParams): Promise<GatewayCheckout>;

  /** Assina um payload de webhook (usado pelo simulador de ciclo de cobrança para se auto-chamar). */
  abstract signWebhookPayload(rawBody: string): string;
  /** Verifica a assinatura de um webhook recebido — HMAC-SHA256 com comparação em tempo constante. */
  abstract verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
