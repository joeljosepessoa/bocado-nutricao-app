import { Injectable } from '@nestjs/common';
import { ReportAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordReportAuditEntry {
  professionalId: string;
  clientId: string;
  reportId?: string;
  action: ReportAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de AuditLogService (avaliações) e das demais tabelas de
 * auditoria do projeto: quem/o quê/quando, nunca o conteúdo. Um
 * failureReason genérico pode ser gravado no Report em si (não aqui), e
 * mesmo esse nunca é um valor de saúde — só uma mensagem técnica.
 */
@Injectable()
export class ReportAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordReportAuditEntry): Promise<void> {
    await this.prisma.reportAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        reportId: entry.reportId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
