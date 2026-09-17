import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, AppointmentAuditAction, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppointmentAuditLogService } from './appointment-audit-log.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

export interface RequestMeta {
  ipAddress?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AppointmentAuditLogService,
  ) {}

  // --- Cliente agenda (profissional é sempre resolvido do próprio Client, nunca de parâmetro) ---

  async bookForClient(clientId: string, dto: CreateAppointmentDto, meta: RequestMeta = {}): Promise<Appointment> {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId } });
    // 404 (não 403) — mesmo padrão do resto do projeto: nunca confirma pro
    // cliente que um slot de outro profissional existe.
    if (!slot || slot.professionalId !== client.professionalId) {
      throw new NotFoundException('Horário não encontrado.');
    }

    // Checagem + reserva atômica: nunca confia só na leitura acima — sob
    // concorrência, duas requisições simultâneas não podem reservar o
    // mesmo slot (a garantia real é o @unique em Appointment.slotId).
    const appointment = await this.prisma.$transaction(async (tx) => {
      const freshSlot = await tx.availabilitySlot.findUnique({ where: { id: dto.slotId } });
      if (!freshSlot || freshSlot.isBooked) {
        throw new ConflictException('Este horário não está mais disponível.');
      }
      if (freshSlot.startAt < new Date()) {
        throw new BadRequestException('Não é possível agendar um horário que já passou.');
      }

      await tx.availabilitySlot.update({ where: { id: dto.slotId }, data: { isBooked: true } });
      return tx.appointment.create({
        data: {
          clientId,
          professionalId: client.professionalId,
          slotId: dto.slotId,
          scheduledAt: freshSlot.startAt,
          durationMinutes: Math.round((freshSlot.endAt.getTime() - freshSlot.startAt.getTime()) / 60_000),
          notes: dto.notes,
        },
      });
    });

    await this.auditLog.record({
      professionalId: client.professionalId,
      clientId,
      appointmentId: appointment.id,
      action: AppointmentAuditAction.appointment_created,
      ipAddress: meta.ipAddress,
    });

    return appointment;
  }

  async listForClient(clientId: string): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({ where: { clientId }, orderBy: { scheduledAt: 'desc' } });
  }

  async cancelForClient(clientId: string, appointmentId: string, meta: RequestMeta = {}): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({ where: { id: appointmentId, clientId } });
    if (!appointment) {
      throw new NotFoundException('Consulta não encontrada.');
    }
    return this.cancel(appointment, meta);
  }

  // --- Profissional (sempre restrito às próprias consultas) ---

  private async assertOwnedAppointment(professionalId: string, appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({ where: { id: appointmentId, professionalId } });
    if (!appointment) {
      throw new NotFoundException('Consulta não encontrada.');
    }
    return appointment;
  }

  /**
   * Inclui o nome do cliente (mesmo padrão de ProfessionalsService.
   * getDashboard) — a Agenda do profissional lista consultas de vários
   * clientes ao mesmo tempo, nunca útil mostrando só um clientId cru.
   */
  async listForProfessional(professionalId: string) {
    return this.prisma.appointment.findMany({
      where: { professionalId },
      include: { client: { select: { id: true, user: { select: { fullName: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async confirmForProfessional(professionalId: string, appointmentId: string, meta: RequestMeta = {}): Promise<Appointment> {
    const appointment = await this.assertOwnedAppointment(professionalId, appointmentId);
    if (appointment.status === AppointmentStatus.cancelled) {
      throw new ConflictException('Não é possível confirmar uma consulta cancelada.');
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.confirmed },
    });
    await this.auditLog.record({
      professionalId,
      clientId: appointment.clientId,
      appointmentId,
      action: AppointmentAuditAction.appointment_confirmed,
      ipAddress: meta.ipAddress,
    });
    return updated;
  }

  async cancelForProfessional(professionalId: string, appointmentId: string, meta: RequestMeta = {}): Promise<Appointment> {
    const appointment = await this.assertOwnedAppointment(professionalId, appointmentId);
    return this.cancel(appointment, meta);
  }

  /** Cancela e libera o slot na mesma transação — nunca deixa um slot "preso" por uma consulta cancelada. */
  private async cancel(appointment: Appointment, meta: RequestMeta): Promise<Appointment> {
    if (appointment.status === AppointmentStatus.cancelled) {
      return appointment;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.cancelled, cancelledAt: new Date() },
      }),
      this.prisma.availabilitySlot.update({ where: { id: appointment.slotId }, data: { isBooked: false } }),
    ]);

    await this.auditLog.record({
      professionalId: appointment.professionalId,
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      action: AppointmentAuditAction.appointment_cancelled,
      ipAddress: meta.ipAddress,
    });

    return updated;
  }
}
