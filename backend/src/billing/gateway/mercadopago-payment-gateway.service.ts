import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanInterval, RecurrenceInterval } from '@prisma/client';
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
import { MockPaymentGatewayService } from './mock-payment-gateway.service';

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 15_000;

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
}

interface MercadoPagoPreapprovalResponse {
  id?: string;
  init_point?: string;
  status?: string;
  external_reference?: string;
}

interface MercadoPagoPaymentResponse {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  external_reference?: string;
}

/**
 * Adapter real do Mercado Pago (Fase 23.4) — só `createOneTimeCheckout`/
 * `createRecurringCheckout` (Checkout Pro via Preferences API / Subscriptions
 * via Preapproval), confirmados contra a documentação oficial atual. Toda
 * comunicação HTTP fica encapsulada aqui — nada de Prisma, nada de regra de
 * negócio do domínio comercial, nunca chamado fora de PaymentGatewayService.
 *
 * Sem SDK (`mercadopago` no npm) de propósito: a API é REST/JSON simples
 * sobre HTTPS com um único header de autenticação — `fetch` nativo do Node
 * (18+, disponível tanto aqui quanto na imagem Docker `node:20`) cobre isso
 * sem adicionar dependência nenhuma, e mantém o isolamento do provider (só
 * este arquivo sabe que existe uma API HTTP por trás).
 *
 * `createCustomer`/`createSubscription`/`cancelSubscription`/`charge` (Fase
 * 22, SaaS) continuam SIMULADOS: o SaaS não tem gateway real escolhido, então
 * este adapter delega esses métodos (e o HMAC do webhook do SaaS) a uma
 * instância interna do MockPaymentGatewayService. Assim, ativar
 * PAYMENT_GATEWAY_PROVIDER=mercadopago para o comercial cliente NÃO quebra
 * o billing SaaS.
 *
 * `signWebhookPayload`/`verifyWebhookSignature` NÃO são implementados
 * aqui de propósito, não por falta de tempo: o esquema real do Mercado
 * Pago (manifest `id:...;request-id:...;ts:...;`, HMAC sobre isso, não
 * sobre o corpo) é estruturalmente incompatível com essas duas
 * assinaturas de método (pensadas para HMAC direto sobre `rawBody`, o
 * esquema do mock). A validação de webhook real fica em
 * `MercadoPagoWebhookSignatureService` (Fase 23.5, módulo
 * `client-billing`), fora do `PaymentGatewayService`.
 */
@Injectable()
export class MercadoPagoPaymentGatewayService extends PaymentGatewayService {
  private readonly logger = new Logger(MercadoPagoPaymentGatewayService.name);
  private readonly accessToken: string;
  private readonly saasGateway: MockPaymentGatewayService;

  constructor(config: ConfigService) {
    super();
    this.saasGateway = new MockPaymentGatewayService(config);
    const token = config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      // Falha no boot (DI instancia isto na inicialização do Nest), não na
      // primeira chamada — mesmo raciocínio de S3StorageService (Fase 20)
      // sem S3_BUCKET.
      throw new Error('PAYMENT_GATEWAY_PROVIDER=mercadopago requer MERCADOPAGO_ACCESS_TOKEN configurado (.env).');
    }
    this.accessToken = token;
  }

  async createOneTimeCheckout(params: CreateCheckoutParams): Promise<GatewayCheckout> {
    const body = {
      items: [
        {
          title: params.description,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: params.amountCents / 100,
        },
      ],
      external_reference: params.externalReference,
      // back_urls/notification_url deliberadamente ausentes: o contrato
      // atual (CreateCheckoutParams) não fornece nenhuma URL de retorno —
      // ambos são opcionais na Preference; notification_url pode ser
      // configurada uma vez no painel do Mercado Pago em vez de por
      // requisição. Não inventamos URL nenhuma aqui.
    };

    const data = await this.request<MercadoPagoPreferenceResponse>('POST', '/checkout/preferences', body);
    if (!data.id || !data.init_point) {
      throw new InternalServerErrorException(
        'Resposta do Mercado Pago sem id/init_point ao criar a preferência de pagamento.',
      );
    }
    return { externalId: data.id, checkoutUrl: data.init_point };
  }

  async createRecurringCheckout(params: CreateRecurringCheckoutParams): Promise<GatewayCheckout> {
    // Só "months" foi confirmado como frequency_type válido na
    // documentação oficial consultada (exemplo de Criar assinatura) —
    // RecurrenceInterval.year vira frequency=12 em vez de arriscar um
    // "years" não documentado; RecurrenceInterval.month vira frequency=1.
    const frequency = params.recurrenceInterval === RecurrenceInterval.year ? 12 : 1;

    const body = {
      reason: params.description,
      external_reference: params.externalReference,
      payer_email: params.payerEmail,
      auto_recurring: {
        frequency,
        frequency_type: 'months',
        transaction_amount: params.amountCents / 100,
        currency_id: 'BRL',
      },
      // back_url deliberadamente ausente: o contrato atual não fornece
      // URL de retorno nenhuma — campo opcional em POST /preapproval.
    };

    const data = await this.request<MercadoPagoPreapprovalResponse>('POST', '/preapproval', body);
    if (!data.id || !data.init_point) {
      throw new InternalServerErrorException(
        'Resposta do Mercado Pago sem id/init_point ao criar a assinatura (preapproval).',
      );
    }
    return { externalId: data.id, checkoutUrl: data.init_point };
  }

  // --- Consulta (Fase 23.5) — o webhook usa isto para confirmar o estado
  // real antes de gravar qualquer coisa; nunca confia só no payload
  // recebido. Nenhuma regra de negócio aqui, só tradução da resposta.

  async getOneTimePayment(paymentId: string): Promise<GatewayPaymentStatus> {
    const data = await this.request<MercadoPagoPaymentResponse>('GET', `/v1/payments/${paymentId}`);
    if (data.id === undefined || data.id === null || !data.status) {
      throw new InternalServerErrorException(`Resposta do Mercado Pago sem id/status ao consultar o pagamento ${paymentId}.`);
    }
    return {
      externalId: String(data.id),
      status: data.status,
      amountCents: Math.round((data.transaction_amount ?? 0) * 100),
      externalReference: data.external_reference,
    };
  }

  async getRecurringSubscription(subscriptionId: string): Promise<GatewaySubscriptionStatus> {
    const data = await this.request<MercadoPagoPreapprovalResponse>('GET', `/preapproval/${subscriptionId}`);
    if (!data.id || !data.status) {
      throw new InternalServerErrorException(
        `Resposta do Mercado Pago sem id/status ao consultar a assinatura ${subscriptionId}.`,
      );
    }
    return { externalId: data.id, status: data.status, externalReference: data.external_reference };
  }

  /**
   * Cancela o preapproval no Mercado Pago: `PUT /preapproval/{id}` com
   * `status`. O valor `canceled` é o que a documentação oficial de
   * "Gerenciamento de assinaturas" informa para cancelar (e `paused` para
   * pausar), enquanto as consultas devolvem `cancelled` — a grafia a
   * enviar deve ser confirmada no sandbox antes de produção. Qualquer
   * recusa do Mercado Pago lança e o estado local NÃO é alterado.
   */
  async cancelRecurringSubscription(externalSubscriptionId: string): Promise<void> {
    await this.request<MercadoPagoPreapprovalResponse>('PUT', `/preapproval/${encodeURIComponent(externalSubscriptionId)}`, {
      status: 'canceled',
    });
  }

  // --- SaaS (Fase 22): simulado — ver comentário da classe. ---

  createCustomer(professionalId: string, email: string): Promise<GatewayCustomer> {
    return this.saasGateway.createCustomer(professionalId, email);
  }

  createSubscription(gatewayCustomerId: string, planCode: string): Promise<GatewaySubscription> {
    return this.saasGateway.createSubscription(gatewayCustomerId, planCode);
  }

  cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    return this.saasGateway.cancelSubscription(gatewaySubscriptionId);
  }

  charge(gatewaySubscriptionId: string, amountCents: number): Promise<GatewayCharge> {
    return this.saasGateway.charge(gatewaySubscriptionId, amountCents);
  }

  /** Cálculo puro (sem rede) — implementado de verdade mesmo fora do escopo principal, igual ao mock. */
  nextPeriodEnd(from: Date, interval: PlanInterval): Date {
    return this.saasGateway.nextPeriodEnd(from, interval);
  }

  /** HMAC-sobre-corpo do webhook do SaaS (mock). O webhook do comercial cliente usa MercadoPagoWebhookSignatureService. */
  signWebhookPayload(rawBody: string): string {
    return this.saasGateway.signWebhookPayload(rawBody);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return this.saasGateway.verifyWebhookSignature(rawBody, signature);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${MERCADOPAGO_API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Nunca inclui o header Authorization/token na mensagem — só o tipo
      // do erro (ex.: "TimeoutError", "TypeError"), nunca a causa completa.
      throw new InternalServerErrorException(
        `Falha de rede ao chamar o Mercado Pago (${method} ${path}): ${error instanceof Error ? error.name : 'erro desconhecido'}.`,
      );
    }

    if (!response.ok) {
      // O corpo do erro pode trazer dados do pagador/da conta: fica só no log
      // do servidor, nunca na mensagem devolvida ao cliente da API.
      const detail = await response.text().catch(() => '');
      this.logger.error(`Mercado Pago retornou ${response.status} para ${method} ${path}. Detalhe: ${detail.slice(0, 500)}`);
      throw new InternalServerErrorException(`Mercado Pago retornou ${response.status} para ${method} ${path}.`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new InternalServerErrorException(`Resposta do Mercado Pago não é um JSON válido (${method} ${path}).`);
    }
  }
}
