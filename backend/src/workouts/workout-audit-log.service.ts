import { Injectable } from '@nestjs/common';
import { WorkoutAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface RecordWorkoutAuditEntry {
  professionalId: string;
  clientId: string;
  workoutId: string;
  workoutVersionId?: string;
  action: WorkoutAuditAction;
  ipAddress?: string;
}

/** Mesmo padrão do AuditLogService (Fase 4) e do DietAuditLogService (Fase 5). */
@Injectable()
export class WorkoutAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordWorkoutAuditEntry): Promise<void> {
    await this.prisma.workoutAuditLog.create({
      data: {
        professionalId: entry.professionalId,
        clientId: entry.clientId,
        workoutId: entry.workoutId,
        workoutVersionId: entry.workoutVersionId,
        action: entry.action,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
