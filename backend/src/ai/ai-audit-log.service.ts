import { Injectable } from '@nestjs/common';
import { AiAuditAction, AiFeatureKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordAiAuditEntry {
  professionalId: string;
  clientId?: string;
  feature?: AiFeatureKey;
  action: AiAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de toda *AuditLog do projeto: quem, quando, qual ação —
 * nunca prompt, contexto ou resposta (isso vive em AiInteractionLog, a
 * tabela de dado, não a de auditoria).
 */
@Injectable()
export class AiAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordAiAuditEntry): Promise<void> {
    await this.prisma.aiAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        feature: entry.feature,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
