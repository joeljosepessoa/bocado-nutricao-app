import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentAuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppointmentAuditLogService } from './appointment-audit-log.service';
import { CreateAvailabilitySlotDto } from './dto/create-availability-slot.dto';

export interface RequestMeta {
  ipAddress?: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AppointmentAuditLogService,
  ) {}

  async createSlot(professionalId: string, dto: CreateAvailabilitySlotDto, meta: RequestMeta = {}) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('O horário de término deve ser depois do início.');
    }
    if (startAt < new Date()) {
      throw new BadRequestException('Não é possível criar disponibilidade no passado.');
    }

    // Conflito checado no backend, nunca só no frontend — dois slots do
    // mesmo profissional nunca podem se sobrepor.
    const overlapping = await this.prisma.availabilitySlot.findFirst({
      where: { professionalId, startAt: { lt: endAt }, endAt: { gt: startAt } },
    });
    if (overlapping) {
      throw new ConflictException('Este horário conflita com uma disponibilidade já existente.');
    }

    const slot = await this.prisma.availabilitySlot.create({ data: { professionalId, startAt, endAt } });
    await this.auditLog.record({ professionalId, action: AppointmentAuditAction.slot_created, ipAddress: meta.ipAddress });
    return slot;
  }

  async listForProfessional(professionalId: string) {
    return this.prisma.availabilitySlot.findMany({
      where: { professionalId, startAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  async removeSlot(professionalId: string, slotId: string, meta: RequestMeta = {}): Promise<void> {
    const slot = await this.prisma.availabilitySlot.findFirst({ where: { id: slotId, professionalId } });
    if (!slot) {
      throw new NotFoundException('Disponibilidade não encontrada.');
    }
    if (slot.isBooked) {
      throw new ConflictException('Este horário já tem uma consulta agendada — cancele a consulta antes de remover.');
    }

    await this.prisma.availabilitySlot.delete({ where: { id: slotId } });
    await this.auditLog.record({ professionalId, action: AppointmentAuditAction.slot_removed, ipAddress: meta.ipAddress });
  }

  private async listBookableForProfessional(professionalId: string) {
    return this.prisma.availabilitySlot.findMany({
      where: { professionalId, isBooked: false, startAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * professionalId nunca vem de parâmetro do cliente — sempre resolvido do
   * próprio Client, mesma regra usada em MessagesService.listForClient.
   */
  async listBookableForClient(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    return this.listBookableForProfessional(client.professionalId);
  }
}
