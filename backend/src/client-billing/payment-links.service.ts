import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingType, ClientBillingAuditAction, PaymentLink, PaymentLinkStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from '../billing/gateway/payment-gateway.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';
import { ProfessionalProductsService } from './professional-products.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

export interface RequestMeta {
  ipAddress?: string;
}

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly products: ProfessionalProductsService,
    private readonly auditLog: ClientBillingAuditLogService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwned(professionalId: string, id: string): Promise<PaymentLink> {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, professionalId } });
    if (!link) {
      throw new NotFoundException('Link de pagamento não encontrado.');
    }
    return link;
  }

  async create(professionalId: string, dto: CreatePaymentLinkDto, meta: RequestMeta = {}): Promise<PaymentLink> {
    // Cliente sempre validado contra o próprio profissional autenticado —
    // nunca um professionalId vindo do corpo da requisição (não existe
    // esse campo no DTO de propósito).
    await this.assertOwnedClient(professionalId, dto.clientId);
    // assertOwnedActive já garante: produto existe, pertence a este
    // profissional (nunca de outro) e está ativo.
    const product = await this.products.assertOwnedActive(professionalId, dto.professionalProductId);

    const id = randomUUID();
    const checkout =
      product.billingType === BillingType.recurring
        ? await this.gateway.createRecurringCheckout({
            amountCents: product.priceCents,
            description: product.name,
            externalReference: id,
          })
        : await this.gateway.createOneTimeCheckout({
            amountCents: product.priceCents,
            description: product.name,
            externalReference: id,
          });

    const link = await this.prisma.paymentLink.create({
      data: {
        id,
        professionalId,
        clientId: dto.clientId,
        professionalProductId: product.id,
        // Fotografia congelada — alterar o preço do produto depois não
        // muda links já gerados (Fase 23.2).
        amountCents: product.priceCents,
        paymentType: product.billingType,
        checkoutUrl: checkout.checkoutUrl,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        ...(product.billingType === BillingType.recurring
          ? { externalSubscriptionId: checkout.externalId }
          : { externalPreferenceId: checkout.externalId }),
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId: dto.clientId,
      paymentLinkId: link.id,
      action: ClientBillingAuditAction.link_created,
      metadata: { professionalProductId: product.id, amountCents: product.priceCents, paymentType: product.billingType },
      ipAddress: meta.ipAddress,
    });

    return link;
  }

  async listMine(professionalId: string, clientId?: string): Promise<PaymentLink[]> {
    return this.prisma.paymentLink.findMany({
      where: { professionalId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForClient(clientId: string): Promise<PaymentLink[]> {
    return this.prisma.paymentLink.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  async getForClient(clientId: string, id: string): Promise<PaymentLink> {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, clientId } });
    if (!link) {
      throw new NotFoundException('Link de pagamento não encontrado.');
    }
    return link;
  }

  async cancel(professionalId: string, id: string, meta: RequestMeta = {}): Promise<PaymentLink> {
    const link = await this.assertOwned(professionalId, id);
    if (link.status !== PaymentLinkStatus.created) {
      throw new ConflictException('Só é possível cancelar um link ainda não pago/convertido.');
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: { status: PaymentLinkStatus.canceled },
    });
    await this.auditLog.record({
      professionalId,
      clientId: link.clientId,
      paymentLinkId: link.id,
      action: ClientBillingAuditAction.link_canceled,
      ipAddress: meta.ipAddress,
    });
    return updated;
  }

  /**
   * Marca como expirado todo link vencido ainda "created" — não é chamado
   * por nenhuma rota nesta fase (não faz sentido como ação de usuário);
   * existe para ser invocado por um cron/reconciliação em fase futura
   * (F23.6+), mesmo raciocínio de BillingCycleService.processDueBilling.
   */
  async markExpired(): Promise<number> {
    const due = await this.prisma.paymentLink.findMany({
      where: { status: PaymentLinkStatus.created, expiresAt: { lte: new Date() } },
    });
    for (const link of due) {
      await this.prisma.paymentLink.update({ where: { id: link.id }, data: { status: PaymentLinkStatus.expired } });
      await this.auditLog.record({
        professionalId: link.professionalId,
        clientId: link.clientId,
        paymentLinkId: link.id,
        action: ClientBillingAuditAction.link_expired,
      });
    }
    return due.length;
  }

  /** Uso interno (ex.: ClientSubscriptionsService, quando o webhook confirmar a autorização em fase futura). */
  async markConverted(id: string): Promise<PaymentLink> {
    return this.prisma.paymentLink.update({ where: { id }, data: { status: PaymentLinkStatus.converted } });
  }
}
