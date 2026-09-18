import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanInterval } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  CreateCheckoutParams,
  CreateRecurringCheckoutParams,
  GatewayCharge,
  GatewayCheckout,
  GatewayCustomer,
  GatewayPaymentStatus,
  GatewaySubscription,
  GatewaySubscriptionStatus,
  PaymentGatewayService,
} from './payment-gateway.service';

// URL claramente falsa (nunca resolve) — mesmo raciocínio dos IDs `mock_*`:
// ninguém confunde isto com um checkout real por engano.
const MOCK_CHECKOUT_BASE_URL = 'https://mock-gateway.invalid/checkout';

interface MockResource {
  externalReference: string;
  status: string;
  amountCents?: number;
}

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
  // Registro em memória {externalId -> recurso} — necessário para que o
  // MESMO id, consultado em webhooks sucessivos, possa refletir um status
  // que evolui com o tempo (ex.: preapproval authorized -> paused ->
  // cancelled), exatamente como um gateway real. Um esquema sem estado
  // (status embutido no próprio id) não sustenta esse cenário: o id nunca
  // muda, então o status "de dentro dele" também não poderia.
  private readonly resources = new Map<string, MockResource>();

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

  // --- Comercial cliente (Fase 23.3) ---

  async createOneTimeCheckout(params: CreateCheckoutParams): Promise<GatewayCheckout> {
    const externalId = `mock_pref_${randomUUID()}`;
    // "pending" é o status inicial real de um pagamento recém-criado no
    // Mercado Pago (vocabulário confirmado da Payments API) — o webhook de
    // teste evolui esse status via `simulateStatusChange`.
    this.resources.set(externalId, { externalReference: params.externalReference, status: 'pending', amountCents: params.amountCents });
    return { externalId, checkoutUrl: `${MOCK_CHECKOUT_BASE_URL}/${externalId}` };
  }

  async createRecurringCheckout(params: CreateRecurringCheckoutParams): Promise<GatewayCheckout> {
    const externalId = `mock_preapproval_${randomUUID()}`;
    // "pending" é um dos dois status confirmados na documentação oficial
    // do preapproval antes de o pagador autorizar (o outro é "authorized").
    this.resources.set(externalId, { externalReference: params.externalReference, status: 'pending', amountCents: params.amountCents });
    return { externalId, checkoutUrl: `${MOCK_CHECKOUT_BASE_URL}/${externalId}` };
  }

  // --- Consulta (Fase 23.5) ---
  //
  // O mock não fala com rede, mas precisa de ALGUM estado para reproduzir
  // fielmente um gateway real: o "Payment ID"/"Preapproval ID" retornado
  // por createOneTimeCheckout/createRecurringCheckout é a chave de um
  // registro em memória (`resources`), e getOneTimePayment/
  // getRecurringSubscription simplesmente leem esse registro — exatamente
  // como uma consulta real leria o estado atual do recurso no gateway.
  // `simulateStatusChange` (só para testes) é o único jeito de fazer esse
  // estado evoluir, permitindo simular o MESMO id passando por status
  // sucessivos ao longo de vários webhooks (ex.: authorized -> paused ->
  // cancelled), o que um esquema sem estado (status embutido no próprio
  // id) não conseguiria sustentar.

  private getResource(id: string): MockResource {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new NotFoundException(`Recurso mock "${id}" não reconhecido.`);
    }
    return resource;
  }

  /**
   * Só para testes — registra diretamente um recurso no mock (sem passar
   * por createOneTimeCheckout/createRecurringCheckout), útil quando o
   * teste só precisa simular a resposta da consulta, não o fluxo de
   * criação do checkout em si.
   */
  registerMockResource(externalId: string, params: { externalReference: string; status: string; amountCents?: number }): void {
    this.resources.set(externalId, { externalReference: params.externalReference, status: params.status, amountCents: params.amountCents });
  }

  /**
   * Só para testes — evolui o status de um recurso já existente (criado
   * via createOneTimeCheckout/createRecurringCheckout ou registerMockResource),
   * simulando "o Mercado Pago agora diz que este id está com outro status"
   * entre uma entrega de webhook e outra, sem mudar o id nem o
   * external_reference.
   */
  simulateStatusChange(externalId: string, status: string): void {
    const resource = this.getResource(externalId);
    resource.status = status;
  }

  async getOneTimePayment(paymentId: string): Promise<GatewayPaymentStatus> {
    const resource = this.getResource(paymentId);
    return {
      externalId: paymentId,
      status: resource.status,
      amountCents: resource.amountCents ?? 0,
      externalReference: resource.externalReference,
    };
  }

  async getRecurringSubscription(subscriptionId: string): Promise<GatewaySubscriptionStatus> {
    const resource = this.getResource(subscriptionId);
    return { externalId: subscriptionId, status: resource.status, externalReference: resource.externalReference };
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
