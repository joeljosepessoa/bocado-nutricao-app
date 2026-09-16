import { Injectable } from '@nestjs/common';
import { DeviceAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordDeviceAuditEntry {
  clientId: string;
  /** Presente só quando a ação foi do profissional (ver comentário no schema). */
  professionalId?: string;
  deviceConnectionId?: string;
  action: DeviceAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de AuditLogService/ReportAuditLogService/ScaleAuditLogService:
 * quem fez o quê e quando — nunca métrica, valor de saúde ou payload bruto,
 * que vivem só em DeviceMetricSample.
 */
@Injectable()
export class DeviceAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordDeviceAuditEntry): Promise<void> {
    await this.prisma.deviceAuditLog.create({
      data: {
        clientId: entry.clientId,
        professionalId: entry.professionalId,
        deviceConnectionId: entry.deviceConnectionId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
