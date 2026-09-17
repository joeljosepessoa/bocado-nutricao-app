import { Injectable } from '@nestjs/common';
import { MessageAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordMessageAuditEntry {
  professionalId: string;
  clientId: string;
  threadId?: string;
  messageId?: string;
  action: MessageAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de ReportAuditLogService: quem/o quê/quando, nunca o
 * conteúdo — o texto da mensagem vive só em Message.body.
 */
@Injectable()
export class MessageAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordMessageAuditEntry): Promise<void> {
    await this.prisma.messageAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        threadId: entry.threadId,
        messageId: entry.messageId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
