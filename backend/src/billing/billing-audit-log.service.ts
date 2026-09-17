import { Injectable } from '@nestjs/common';
import { BillingAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordBillingAuditEntry {
  professionalId: string;
  subscriptionId?: string;
  action: BillingAuditAction;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Mesmo padrão de ReportAuditLogService/AppointmentAuditLogService: quem/o
 * quê/quando. `metadata` é livre mas nunca deve conter dado de cartão —
 * isso nem chega à nossa aplicação (tokenização é responsabilidade do
 * gateway).
 */
@Injectable()
export class BillingAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordBillingAuditEntry): Promise<void> {
    await this.prisma.billingAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        subscriptionId: entry.subscriptionId,
        action: entry.action,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
