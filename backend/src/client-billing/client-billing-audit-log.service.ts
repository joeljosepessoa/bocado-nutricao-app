import { Injectable } from '@nestjs/common';
import { ClientBillingAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordClientBillingAuditEntry {
  professionalId: string;
  // Opcional: ações sobre o catálogo (ProfessionalProduct) não envolvem
  // nenhum cliente específico.
  clientId?: string;
  paymentLinkId?: string;
  clientSubscriptionId?: string;
  action: ClientBillingAuditAction;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Mesmo papel que BillingAuditLogService (Fase 22) e os demais *AuditLog
 * do projeto: quem/o quê/quando. `metadata` nunca deve conter Access
 * Token, segredo de webhook, número de cartão, CVV ou qualquer dado
 * bancário — só informação técnica não sensível.
 */
@Injectable()
export class ClientBillingAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordClientBillingAuditEntry): Promise<void> {
    await this.prisma.clientBillingAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        paymentLinkId: entry.paymentLinkId,
        clientSubscriptionId: entry.clientSubscriptionId,
        action: entry.action,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
