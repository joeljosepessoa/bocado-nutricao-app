import { Injectable } from '@nestjs/common';
import { ScaleAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordScaleAuditEntry {
  professionalId: string;
  clientId: string;
  evaluationId?: string;
  action: ScaleAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de AuditLogService (avaliações)/ReportAuditLogService: quem
 * fez o quê e quando — nunca peso, %gordura ou o payload bruto da balança,
 * que vivem só em ScaleReading.
 */
@Injectable()
export class ScaleAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordScaleAuditEntry): Promise<void> {
    await this.prisma.scaleAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        evaluationId: entry.evaluationId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
