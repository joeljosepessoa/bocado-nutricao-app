import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientInvoice, ClientInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

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
 * Leitura/listagem nesta fase; `create` existe para ser reaproveitado pelo
 * futuro webhook (Fase 23.6+) — nenhuma rota chama `create` ainda, não há
 * nenhum fluxo de negócio nesta fase que gere uma fatura de verdade.
 */
@Injectable()
export class ClientInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const hasLink = Boolean(params.paymentLinkId);
    const hasSubscription = Boolean(params.clientSubscriptionId);
    if (hasLink === hasSubscription) {
      throw new BadRequestException(
        'ClientInvoice deve ter exatamente uma origem: paymentLinkId ou clientSubscriptionId, nunca os dois nem nenhum.',
      );
    }

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
}
