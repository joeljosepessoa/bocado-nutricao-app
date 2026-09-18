import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientBillingAuditAction, ClientInvoice, ClientInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';

export interface CreateClientInvoiceParams {
  professionalId: string;
  clientId: string;
  paymentLinkId?: string;
  clientSubscriptionId?: string;
  amountCents: number;
  status?: ClientInvoiceStatus;
  externalPaymentId: string;
  paidAt?: Date;
}

/**
 * Leitura/listagem desde a Fase 23.3; `create`/`upsertByExternalPaymentId`
 * passam a ser usados de verdade pelo webhook (Fase 23.5) — antes disso
 * nenhum fluxo de negócio gerava fatura real.
 */
@Injectable()
export class ClientInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: ClientBillingAuditLogService,
  ) {}

  async listForProfessional(professionalId: string, clientId?: string): Promise<ClientInvoice[]> {
    return this.prisma.clientInvoice.findMany({
      where: { professionalId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForClient(clientId: string): Promise<ClientInvoice[]> {
    return this.prisma.clientInvoice.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  // Exatamente uma origem (Fase 23.2: regra não expressável declarativamente
  // no Prisma) — nunca as duas, nunca nenhuma.
  async create(params: CreateClientInvoiceParams): Promise<ClientInvoice> {
    this.assertExactlyOneOrigin(params);
    return this.prisma.clientInvoice.create({
      data: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        paymentLinkId: params.paymentLinkId,
        clientSubscriptionId: params.clientSubscriptionId,
        amountCents: params.amountCents,
        status: params.status ?? ClientInvoiceStatus.pending,
        externalPaymentId: params.externalPaymentId,
        paidAt: params.paidAt,
      },
    });
  }

  private assertExactlyOneOrigin(params: Pick<CreateClientInvoiceParams, 'paymentLinkId' | 'clientSubscriptionId'>): void {
    const hasLink = Boolean(params.paymentLinkId);
    const hasSubscription = Boolean(params.clientSubscriptionId);
    if (hasLink === hasSubscription) {
      throw new BadRequestException(
        'ClientInvoice deve ter exatamente uma origem: paymentLinkId ou clientSubscriptionId, nunca os dois nem nenhum.',
      );
    }
  }

  /**
   * Idempotente sob concorrência via `upsert` nativo do Prisma sobre
   * `externalPaymentId` (@unique) — o Postgres resolve dois `upsert`
   * simultâneos para o mesmo ID atomicamente (INSERT … ON CONFLICT DO
   * UPDATE), sem depender de "findFirst then create" fora de transação
   * (Fase 23.5: webhook pode reentregar o mesmo evento, ou dois workers
   * podem processá-lo ao mesmo tempo). Nunca duplica a fatura. Só chamado
   * pelo webhook com um status final já decidido (paid/failed/refunded) —
   * estados intermediários/desconhecidos não tocam a fatura (ver
   * ClientBillingWebhookService).
   */
  async upsertByExternalPaymentId(params: CreateClientInvoiceParams, meta: { ipAddress?: string } = {}): Promise<ClientInvoice> {
    this.assertExactlyOneOrigin(params);
    const status = params.status ?? ClientInvoiceStatus.pending;
    const invoice = await this.prisma.clientInvoice.upsert({
      where: { externalPaymentId: params.externalPaymentId },
      create: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        paymentLinkId: params.paymentLinkId,
        clientSubscriptionId: params.clientSubscriptionId,
        amountCents: params.amountCents,
        status,
        externalPaymentId: params.externalPaymentId,
        paidAt: params.paidAt,
      },
      update: {
        status,
        paidAt: params.paidAt,
      },
    });

    await this.auditLog.record({
      professionalId: params.professionalId,
      clientId: params.clientId,
      paymentLinkId: params.paymentLinkId,
      clientSubscriptionId: params.clientSubscriptionId,
      action: status === ClientInvoiceStatus.paid ? ClientBillingAuditAction.payment_approved : ClientBillingAuditAction.payment_failed,
      metadata: { externalPaymentId: params.externalPaymentId, status },
      ipAddress: meta.ipAddress,
    });

    return invoice;
  }
}
