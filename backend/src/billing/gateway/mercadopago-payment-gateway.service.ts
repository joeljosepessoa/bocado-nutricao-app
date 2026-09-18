import { Injectable, InternalServerErrorException, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanInterval, RecurrenceInterval } from '@prisma/client';
import {
  CreateCheckoutParams,
  CreateRecurringCheckoutParams,
  GatewayCharge,
  GatewayCheckout,
  GatewayCustomer,
  GatewaySubscription,
  PaymentGatewayService,
} from './payment-gateway.service';

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 15_000;

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
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
 * 22, SaaS) e `signWebhookPayload`/`verifyWebhookSignature` (webhook, Fase
 * 23.6) NÃO são implementados aqui — fora do escopo desta fase (SaaS
 * continua só no mock; webhook é etapa própria).
 */
@Injectable()
export class MercadoPagoPaymentGatewayService extends PaymentGatewayService {
  private readonly accessToken: string;

  constructor(config: ConfigService) {
    super();
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
    // Incompatibilidade real entre o domínio e a API, encontrada nesta
    // fase (não mascarada): POST /preapproval exige `payer_email`, campo
    // marcado OBRIGATÓRIO de forma incondicional na referência oficial
    // (ao contrário de `reason`/`external_reference`, que só são
    // obrigatórios sem plano associado). CreateRecurringCheckoutParams
    // não carrega e-mail nenhum do cliente hoje, e este adapter não pode
    // inventar um nem consultar o Prisma para obtê-lo (fora do escopo do
    // adapter, Fase 23.4). Completar isto exige uma decisão de produto
    // sobre de onde esse e-mail vem — ver relatório da Fase 23.4.
    //
    // Mapeamento de periodicidade já resolvido para quando isso acontecer
    // (só documentado aqui, nada é enviado): só "months" foi confirmado
    // como frequency_type válido na documentação oficial consultada
    // (exemplo de Criar assinatura) — RecurrenceInterval.year viraria
    // frequency=12 + frequency_type="months" em vez de arriscar um
    // "years" não documentado; RecurrenceInterval.month viraria
    // frequency=1 + frequency_type="months".
    const wouldBeFrequency = params.recurrenceInterval === RecurrenceInterval.year ? 12 : 1;

    throw new NotImplementedException(
      `createRecurringCheckout via Mercado Pago ainda não está disponível: POST /preapproval exige payer_email ` +
        `(campo obrigatório na API), que o contrato atual do domínio comercial não fornece. Mapeamento de ` +
        `periodicidade já resolvido (frequency=${wouldBeFrequency}, frequency_type="months") — falta decisão de ` +
        `produto sobre a origem do e-mail do pagador antes de completar esta implementação (ver relatório da Fase 23.4).`,
    );
  }

  // --- Fora do escopo desta fase (SaaS/webhook) — ver comentário da classe. ---

  async createCustomer(_professionalId: string, _email: string): Promise<GatewayCustomer> {
    throw new NotImplementedException('SaaS (Fase 22) continua exclusivamente no MockPaymentGatewayService.');
  }

  async createSubscription(_gatewayCustomerId: string, _planCode: string): Promise<GatewaySubscription> {
    throw new NotImplementedException('SaaS (Fase 22) continua exclusivamente no MockPaymentGatewayService.');
  }

  async cancelSubscription(_gatewaySubscriptionId: string): Promise<void> {
    throw new NotImplementedException('SaaS (Fase 22) continua exclusivamente no MockPaymentGatewayService.');
  }

  async charge(_gatewaySubscriptionId: string, _amountCents: number): Promise<GatewayCharge> {
    throw new NotImplementedException('SaaS (Fase 22) continua exclusivamente no MockPaymentGatewayService.');
  }

  /** Cálculo puro (sem rede) — implementado de verdade mesmo fora do escopo principal, igual ao mock. */
  nextPeriodEnd(from: Date, interval: PlanInterval): Date {
    const next = new Date(from);
    if (interval === PlanInterval.year) {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  signWebhookPayload(_rawBody: string): string {
    throw new NotImplementedException(
      'Assinatura de webhook do Mercado Pago é Fase 23.6 — esquema diferente (manifest id/request-id/ts) do HMAC sobre o corpo usado pelo mock.',
    );
  }

  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    throw new NotImplementedException('Verificação de webhook do Mercado Pago é Fase 23.6.');
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${MERCADOPAGO_API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
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
      const detail = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Mercado Pago retornou ${response.status} para ${method} ${path}.${detail ? ` Detalhe: ${detail.slice(0, 500)}` : ''}`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new InternalServerErrorException(`Resposta do Mercado Pago não é um JSON válido (${method} ${path}).`);
    }
  }
}
