import { Injectable } from '@nestjs/common';
import { AdminAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordAdminAuditEntry {
  adminId: string;
  targetType?: 'professional' | 'food' | 'exercise';
  targetId?: string;
  action: AdminAuditAction;
  ipAddress?: string;
}

/**
 * Mesmo padrão de DeviceAuditLogService/ScaleAuditLogService/AiAuditLog: só
 * quem/o quê/quando, nunca senha, token ou dado sensível.
 */
@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordAdminAuditEntry): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId: entry.adminId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
