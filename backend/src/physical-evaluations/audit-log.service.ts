import { Injectable } from '@nestjs/common';
import { EvaluationAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordAuditEntry {
  professionalId: string;
  clientId: string;
  evaluationId?: string;
  action: EvaluationAuditAction;
  ipAddress?: string;
}

/**
 * Registra quem acessou/operou qual avaliação e quando — nunca os valores
 * de saúde em si (peso, dobras, bioimpedância etc. nunca entram aqui).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordAuditEntry): Promise<void> {
    await this.prisma.evaluationAuditLog.create({
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
