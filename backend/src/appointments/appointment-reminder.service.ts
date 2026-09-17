import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus, NotificationEventType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

/**
 * Janela do lembrete: consultas que começam dentro das próximas 24h e ainda
 * não tiveram lembrete enviado. Valor fixo e documentado — não é uma
 * preferência configurável nesta fase (não pedido no escopo).
 */
export const REMINDER_WINDOW_HOURS = 24;

/**
 * Abstração limpa pro lembrete: nenhum job/fila pesada existia no projeto
 * (confirmado por auditoria — sem @nestjs/schedule, sem Bull, sem cron
 * algum). @nestjs/schedule é a peça mínima suficiente — roda no mesmo
 * processo do Nest, sem broker externo, sem worker separado. A parte que
 * realmente depende de infraestrutura de produção não é o agendamento
 * (isso já funciona de verdade), é a ENTREGA do push em si — mesma
 * dependência documentada desde a Fase 16 (sem projeto EAS configurado).
 *
 * Roda a cada 10 minutos (menor intervalo nativo do @nestjs/schedule
 * próximo de 15min). `sendDueReminders` é público e chamável diretamente
 * (fora do cron) de propósito — é assim que os testes e2e disparam o
 * lembrete sem esperar o agendamento real.
 */
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

    const dueAppointments = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.scheduled, AppointmentStatus.confirmed] },
        reminderSentAt: null,
        scheduledAt: { gte: now, lte: windowEnd },
      },
    });

    for (const appointment of dueAppointments) {
      try {
        await this.notifications.dispatch({
          eventType: NotificationEventType.appointment_reminder,
          recipient: { clientId: appointment.clientId },
          title: 'Lembrete de consulta',
          body: 'Você tem uma consulta agendada em breve.',
        });
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Falha ao processar lembrete da consulta ${appointment.id}`, err as Error);
      }
    }
  }
}
