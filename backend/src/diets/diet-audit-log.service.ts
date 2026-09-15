import { Injectable } from '@nestjs/common';
import { DietAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordDietAuditEntry {
  professionalId: string;
  clientId: string;
  dietId: string;
  dietVersionId?: string;
  action: DietAuditAction;
  ipAddress?: string;
}

/** Mesmo padrão do AuditLogService da Fase 4 — nunca grava valor nutricional. */
@Injectable()
export class DietAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordDietAuditEntry): Promise<void> {
    await this.prisma.dietAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        dietId: entry.dietId,
        dietVersionId: entry.dietVersionId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
