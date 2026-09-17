import { Injectable } from '@nestjs/common';
import { AppointmentAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordAppointmentAuditEntry {
  professionalId: string;
  clientId?: string;
  appointmentId?: string;
  action: AppointmentAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo papel que os demais *AuditLog do projeto: quem/o quê/quando, nunca
 * conteúdo livre (notes de Appointment nunca é gravado aqui).
 */
@Injectable()
export class AppointmentAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordAppointmentAuditEntry): Promise<void> {
    await this.prisma.appointmentAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        appointmentId: entry.appointmentId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
