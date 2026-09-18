import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingType, ClientBillingAuditAction, ProfessionalProduct } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClientBillingAuditLogService } from './client-billing-audit-log.service';
import { CreateProfessionalProductDto } from './dto/create-professional-product.dto';
import { UpdateProfessionalProductDto } from './dto/update-professional-product.dto';

export interface RequestMeta {
  ipAddress?: string;
}

/**
 * Catálogo do que o profissional vende ao próprio cliente — fonte de
 * verdade de preço no backend (Fase 23.2/23.3): PaymentLink nunca aceita
 * um valor vindo do frontend, sempre copia priceCents daqui.
 */
@Injectable()
export class ProfessionalProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: ClientBillingAuditLogService,
  ) {}

  private async assertOwned(professionalId: string, id: string): Promise<ProfessionalProduct> {
    const product = await this.prisma.professionalProduct.findFirst({ where: { id, professionalId } });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return product;
  }

  // billingType=recurring exige recurrenceInterval; billingType=one_time proíbe —
  // regra não expressável declarativamente no Prisma (Fase 23.2), garantida aqui.
  private assertValidRecurrence(billingType: BillingType, recurrenceInterval: unknown): void {
    if (billingType === BillingType.recurring && !recurrenceInterval) {
      throw new BadRequestException('recurrenceInterval é obrigatório para produtos recorrentes.');
    }
    if (billingType === BillingType.one_time && recurrenceInterval) {
      throw new BadRequestException('recurrenceInterval não deve ser informado para produtos de pagamento único.');
    }
  }

  async create(professionalId: string, dto: CreateProfessionalProductDto, meta: RequestMeta = {}): Promise<ProfessionalProduct> {
    this.assertValidRecurrence(dto.billingType, dto.recurrenceInterval);
    const product = await this.prisma.professionalProduct.create({
      data: {
        professionalId,
        name: dto.name,
        description: dto.description,
        priceCents: dto.priceCents,
        billingType: dto.billingType,
        recurrenceInterval: dto.recurrenceInterval,
      },
    });
    await this.auditLog.record({
      professionalId,
      action: ClientBillingAuditAction.product_created,
      metadata: { professionalProductId: product.id, priceCents: product.priceCents, billingType: product.billingType },
      ipAddress: meta.ipAddress,
    });
    return product;
  }

  async list(professionalId: string): Promise<ProfessionalProduct[]> {
    return this.prisma.professionalProduct.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    professionalId: string,
    id: string,
    dto: UpdateProfessionalProductDto,
    meta: RequestMeta = {},
  ): Promise<ProfessionalProduct> {
    const product = await this.assertOwned(professionalId, id);
    const billingType = dto.billingType ?? product.billingType;
    const recurrenceInterval = dto.recurrenceInterval !== undefined ? dto.recurrenceInterval : product.recurrenceInterval;
    this.assertValidRecurrence(billingType, recurrenceInterval);

    const updated = await this.prisma.professionalProduct.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        priceCents: dto.priceCents,
        billingType: dto.billingType,
        recurrenceInterval: dto.billingType === BillingType.one_time ? null : dto.recurrenceInterval,
        active: dto.active,
      },
    });
    await this.auditLog.record({
      professionalId,
      action: ClientBillingAuditAction.product_updated,
      metadata: { professionalProductId: id },
      ipAddress: meta.ipAddress,
    });
    return updated;
  }

  /** Soft — nunca apaga: um produto pode já ter payment links/faturas referenciando-o. */
  async deactivate(professionalId: string, id: string, meta: RequestMeta = {}): Promise<ProfessionalProduct> {
    await this.assertOwned(professionalId, id);
    const updated = await this.prisma.professionalProduct.update({ where: { id }, data: { active: false } });
    await this.auditLog.record({
      professionalId,
      action: ClientBillingAuditAction.product_deactivated,
      metadata: { professionalProductId: id },
      ipAddress: meta.ipAddress,
    });
    return updated;
  }

  /** Uso interno de outros services (ex.: PaymentLinksService) — nunca exposto direto por rota. */
  async assertOwnedActive(professionalId: string, id: string): Promise<ProfessionalProduct> {
    const product = await this.assertOwned(professionalId, id);
    if (!product.active) {
      throw new BadRequestException('Este produto está inativo e não pode gerar novos links de pagamento.');
    }
    return product;
  }
}
