import { Injectable, Logger } from '@nestjs/common';
import { BillingType, ClientBillingAuditAction, ClientInvoiceStatus, PaymentLinkStatus } from '@prisma/client';
import { PaymentGatewayService } from '../billing/gateway/payment-gateway.service';
import { MercadoPagoWebhookSignatureService } from './mercadopago-webhook-signature.service';
import { PaymentLinksService } from './payment-links.service';
import { ClientSubscriptionsService } from './client-subscriptions.service';
import { ClientInvoicesService } from './client-invoices.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';

export interface WebhookRequestMeta {
  ipAddress?: string;
}

export interface WebhookInput {
  type?: string;
  dataId?: string;
  requestId?: string;
  xSignature?: string;
}

export interface WebhookResult {
  /** true = pode responder 200/201 (evento autêntico, processado ou seguramente ignorado). false = assinatura inválida, responder 400. */
  accepted: boolean;
  reason: string;
}

const PAYMENT_TOPIC = 'payment';
const SUBSCRIPTION_TOPIC = 'subscription_preapproval';

// Vocabulário confirmado na documentação oficial de Payments API.
const APPROVED_STATUSES = new Set(['approved']);
const FAILED_STATUSES = new Set(['rejected', 'cancelled']);
const REFUNDED_STATUSES = new Set(['refunded', 'charged_back']);

/**
 * Orquestrador do webhook do comercial cliente (Fase 23.5) — só ele
 * decide o fluxo; toda a lógica específica de cada recurso fica nos
 * services já existentes (PaymentLinksService/ClientSubscriptionsService/
 * ClientInvoicesService), nunca reimplementada aqui.
 *
 * A assinatura só prova QUEM enviou — nunca o que aconteceu. Por isso
 * `data.id` nunca é usado sozinho: sempre consultamos o recurso de volta
 * no gateway (PaymentGatewayService) e resolvemos o registro comercial
 * pelo `external_reference` que O PRÓPRIO MERCADO PAGO devolve (nunca
 * por um clientId/professionalId/valor vindo do payload) — o dono e o
 * valor sempre vêm do nosso banco, nunca do webhook.
 *
 * Eventos rejeitados antes de resolvermos um professionalId (assinatura
 * inválida, tipo não tratado, referência desconhecida) não têm como
 * entrar em ClientBillingAuditLog (professionalId opcional, mas não faz
 * sentido gravar um log "de ninguém") — vão para o Logger da aplicação,
 * que já é o canal de observabilidade operacional do projeto (Fase 20).
 */
@Injectable()
export class ClientBillingWebhookService {
  private readonly logger = new Logger(ClientBillingWebhookService.name);

  constructor(
    private readonly gateway: PaymentGatewayService,
    private readonly signature: MercadoPagoWebhookSignatureService,
    private readonly paymentLinks: PaymentLinksService,
    private readonly clientSubscriptions: ClientSubscriptionsService,
    private readonly clientInvoices: ClientInvoicesService,
    private readonly auditLog: ClientBillingAuditLogService,
  ) {}

  async process(input: WebhookInput, meta: WebhookRequestMeta = {}): Promise<WebhookResult> {
    const valid = this.signature.verify({ dataId: input.dataId, requestId: input.requestId, xSignature: input.xSignature });
    if (!valid) {
      this.logger.warn(`Webhook rejeitado: assinatura inválida (type=${input.type ?? '—'}).`);
      return { accepted: false, reason: 'invalid_signature' };
    }

    if (!input.dataId) {
      this.logger.warn('Webhook com assinatura válida mas sem data.id — rejeitado.');
      return { accepted: false, reason: 'missing_data_id' };
    }

    if (input.type === PAYMENT_TOPIC) {
      return this.processPayment(input.dataId, meta);
    }
    if (input.type === SUBSCRIPTION_TOPIC) {
      return this.processSubscription(input.dataId, meta);
    }

    // Tópico autêntico (assinatura válida) mas que não escolhemos tratar
    // nesta fase (ex.: subscription_authorized_payment — cada cobrança
    // recorrente individual, fora de escopo da Fase 23.5; ver relatório).
    // Não é erro nosso nem do remetente — só não processável aqui.
    this.logger.log(`Webhook recebido para tópico não tratado: "${input.type ?? '—'}". Nenhuma ação aplicada.`);
    return { accepted: true, reason: 'unhandled_topic' };
  }

  private async processPayment(paymentId: string, meta: WebhookRequestMeta): Promise<WebhookResult> {
    const payment = await this.gateway.getOneTimePayment(paymentId);

    if (!payment.externalReference) {
      this.logger.warn(`Pagamento ${paymentId} consultado no Mercado Pago sem external_reference — não é possível correlacionar.`);
      return { accepted: true, reason: 'missing_external_reference' };
    }

    const link = await this.paymentLinks.findById(payment.externalReference);
    if (!link) {
      // Nunca cria uma entidade comercial só porque o Mercado Pago enviou
      // um ID desconhecido — external_reference não bate com nenhum
      // PaymentLink nosso.
      this.logger.warn(`Pagamento ${paymentId}: external_reference "${payment.externalReference}" não corresponde a nenhum PaymentLink.`);
      return { accepted: true, reason: 'unknown_payment_link' };
    }

    // Este handler é o de PAGAMENTO ÚNICO (Checkout Pro). Um `payment` cujo
    // external_reference é de um link RECORRENTE (ex.: cobrança de um ciclo do
    // preapproval) não pode virar fatura do link nem marcá-lo `paid` — o
    // ciclo de vida de assinatura é tratado pelo tópico subscription_preapproval.
    // Faturas de ciclos recorrentes ainda não são geradas (limitação conhecida).
    if (link.paymentType === BillingType.recurring) {
      this.logger.warn(`Pagamento ${paymentId}: pertence a um link recorrente (${link.id}) — ignorado pelo handler de pagamento único.`);
      return { accepted: true, reason: 'recurring_link_payment_ignored' };
    }

    // A partir daqui já sabemos a quem este evento pertence — registra o
    // recebimento como auditoria estruturada (não só Logger).
    await this.auditLog.record({
      professionalId: link.professionalId,
      clientId: link.clientId,
      paymentLinkId: link.id,
      action: ClientBillingAuditAction.webhook_received,
      metadata: { type: PAYMENT_TOPIC, externalPaymentId: paymentId, gatewayStatus: payment.status },
      ipAddress: meta.ipAddress,
    });

    let status: ClientInvoiceStatus | null = null;
    if (APPROVED_STATUSES.has(payment.status)) {
      status = ClientInvoiceStatus.paid;
    } else if (FAILED_STATUSES.has(payment.status)) {
      status = ClientInvoiceStatus.failed;
    } else if (REFUNDED_STATUSES.has(payment.status)) {
      status = ClientInvoiceStatus.refunded;
    }

    if (!status) {
      // pending/in_process/authorized/in_mediation ou qualquer status não
      // mapeado — estado intermediário ou desconhecido: não inventamos
      // uma transição, só registramos que o evento chegou.
      this.logger.log(`Pagamento ${paymentId} (link ${link.id}) com status "${payment.status}" — nenhuma transição aplicada.`);
      return { accepted: true, reason: 'non_terminal_status' };
    }

    // O valor gravado é sempre o do NOSSO PaymentLink (congelado na
    // criação), nunca o que o gateway devolveu — o valor autoritativo é
    // sempre o do nosso banco (Fase 23.5, regra de segurança explícita).
    await this.clientInvoices.upsertByExternalPaymentId(
      {
        professionalId: link.professionalId,
        clientId: link.clientId,
        paymentLinkId: link.id,
        amountCents: link.amountCents,
        status,
        externalPaymentId: paymentId,
        paidAt: status === ClientInvoiceStatus.paid ? new Date() : undefined,
      },
      meta,
    );

    if (status === ClientInvoiceStatus.paid && link.status === PaymentLinkStatus.created) {
      await this.paymentLinks.markPaid(link.id);
    }

    return { accepted: true, reason: `payment_${status}` };
  }

  private async processSubscription(subscriptionId: string, meta: WebhookRequestMeta): Promise<WebhookResult> {
    const subscription = await this.gateway.getRecurringSubscription(subscriptionId);

    if (subscription.status === 'authorized') {
      return this.handleSubscriptionAuthorized(subscriptionId, subscription.externalReference, meta);
    }
    if (subscription.status === 'paused' || subscription.status === 'cancelled' || subscription.status === 'canceled') {
      return this.handleSubscriptionStatusChange(subscriptionId, subscription.status, meta);
    }

    this.logger.log(`Assinatura ${subscriptionId} com status "${subscription.status}" — nenhuma transição aplicada.`);
    return { accepted: true, reason: 'non_terminal_status' };
  }

  private async handleSubscriptionAuthorized(
    subscriptionId: string,
    externalReference: string | undefined,
    meta: WebhookRequestMeta,
  ): Promise<WebhookResult> {
    // Já autorizada antes (reentrega, ou reativação após pausa) — aplica
    // direto pela linha já existente, sem precisar do PaymentLink de novo.
    const existing = await this.clientSubscriptions.findByExternalSubscriptionId(subscriptionId);
    if (existing) {
      await this.auditLog.record({
        professionalId: existing.professionalId,
        clientId: existing.clientId,
        clientSubscriptionId: existing.id,
        action: ClientBillingAuditAction.webhook_received,
        metadata: { type: SUBSCRIPTION_TOPIC, externalSubscriptionId: subscriptionId, gatewayStatus: 'authorized' },
        ipAddress: meta.ipAddress,
      });
      await this.clientSubscriptions.applyGatewayStatus(
        { externalSubscriptionId: subscriptionId, gatewayStatus: 'authorized', source: 'webhook' },
        meta,
      );
      return { accepted: true, reason: 'subscription_authorized' };
    }

    if (!externalReference) {
      this.logger.warn(`Assinatura ${subscriptionId} consultada sem external_reference — não é possível correlacionar.`);
      return { accepted: true, reason: 'missing_external_reference' };
    }

    // Primeira autorização: o PaymentLink que originou o preapproval já
    // guarda externalSubscriptionId (preenchido em PaymentLinksService.create) —
    // confirmar que bate com o ID consultado é uma checagem extra de
    // integridade, não só confiar no external_reference isolado.
    const link = await this.paymentLinks.findById(externalReference);
    if (!link || link.externalSubscriptionId !== subscriptionId) {
      this.logger.warn(`Assinatura ${subscriptionId}: external_reference "${externalReference}" não corresponde a nenhum PaymentLink conhecido.`);
      return { accepted: true, reason: 'unknown_payment_link' };
    }

    await this.auditLog.record({
      professionalId: link.professionalId,
      clientId: link.clientId,
      paymentLinkId: link.id,
      action: ClientBillingAuditAction.webhook_received,
      metadata: { type: SUBSCRIPTION_TOPIC, externalSubscriptionId: subscriptionId, gatewayStatus: 'authorized' },
      ipAddress: meta.ipAddress,
    });

    await this.clientSubscriptions.activateFromWebhook(
      {
        professionalId: link.professionalId,
        clientId: link.clientId,
        professionalProductId: link.professionalProductId,
        paymentLinkId: link.id,
        externalSubscriptionId: subscriptionId,
        currentPeriodStart: new Date(),
        // Fim do primeiro período não é calculado aqui de propósito: sem
        // tratar o tópico subscription_authorized_payment (fora do escopo
        // desta fase — ver relatório), não temos uma data confirmada pelo
        // gateway para isso; melhor deixar em aberto do que inventar.
      },
      meta,
    );

    if (link.status !== PaymentLinkStatus.converted) {
      await this.paymentLinks.markConverted(link.id);
    }

    return { accepted: true, reason: 'subscription_authorized' };
  }

  private async handleSubscriptionStatusChange(
    subscriptionId: string,
    status: string,
    meta: WebhookRequestMeta,
  ): Promise<WebhookResult> {
    const result = await this.clientSubscriptions.applyGatewayStatus(
      { externalSubscriptionId: subscriptionId, gatewayStatus: status, source: 'webhook' },
      meta,
    );
    if (!('subscription' in result)) {
      // paused/cancelled só pode se aplicar a uma assinatura que já foi
      // autorizada antes — nunca cria uma ClientSubscription a partir de
      // um evento de pausa/cancelamento.
      this.logger.warn(`Assinatura ${subscriptionId}: evento "${status}" para uma assinatura desconhecida (nunca autorizada em nosso sistema).`);
      return { accepted: true, reason: 'unknown_subscription' };
    }
    const updated = result.subscription;

    await this.auditLog.record({
      professionalId: updated.professionalId,
      clientId: updated.clientId,
      clientSubscriptionId: updated.id,
      action: ClientBillingAuditAction.webhook_received,
      metadata: { type: SUBSCRIPTION_TOPIC, externalSubscriptionId: subscriptionId, gatewayStatus: status },
      ipAddress: meta.ipAddress,
    });

    return { accepted: true, reason: `subscription_${status}` };
  }
}
