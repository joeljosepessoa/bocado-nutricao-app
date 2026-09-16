import { Injectable, Logger } from '@nestjs/common';
import { NotificationEventType, NotificationLogStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationService } from './notification.service';

export type NotificationRecipient = { clientId: string } | { professionalId: string };

export interface DispatchNotificationInput {
  eventType: NotificationEventType;
  recipient: NotificationRecipient;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Orquestra evento -> preferência -> tokens ativos -> envio -> log. Chamado
 * pelos services de reports/physical-evaluations/diets/workouts DEPOIS da
 * ação principal já ter sido persistida (nunca dentro de uma $transaction).
 * Nunca lança exceção — notificação é sempre "melhor esforço": uma falha
 * aqui jamais pode derrubar a ação que a disparou (liberar avaliação,
 * publicar dieta/treino, liberar relatório).
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async dispatch(input: DispatchNotificationInput): Promise<void> {
    try {
      await this.dispatchOrThrow(input);
    } catch (err) {
      this.logger.error(`Falha ao processar notificação (${input.eventType})`, err as Error);
    }
  }

  private async dispatchOrThrow(input: DispatchNotificationInput): Promise<void> {
    const { eventType, recipient, title, body, data } = input;
    const ownerFilter = 'clientId' in recipient ? { clientId: recipient.clientId } : { professionalId: recipient.professionalId };

    // Ausência de preferência = permitido (opt-out, não opt-in) — ninguém
    // precisa configurar nada para começar a receber.
    const preference = await this.prisma.notificationPreference.findFirst({ where: { ...ownerFilter, eventType } });
    if (preference && !preference.enabled) {
      await this.log({ ...ownerFilter, eventType, status: NotificationLogStatus.skipped_preference });
      return;
    }

    const tokens = await this.prisma.deviceToken.findMany({ where: { ...ownerFilter, revokedAt: null } });
    if (tokens.length === 0) {
      await this.log({
        ...ownerFilter,
        eventType,
        status: NotificationLogStatus.failed,
        errorMessage: 'Nenhum dispositivo registrado para este destinatário.',
      });
      return;
    }

    for (const deviceToken of tokens) {
      try {
        await this.notificationService.send({ to: deviceToken.token, title, body, data });
        await this.log({ ...ownerFilter, eventType, status: NotificationLogStatus.sent, deviceTokenId: deviceToken.id });
      } catch (err) {
        await this.log({
          ...ownerFilter,
          eventType,
          status: NotificationLogStatus.failed,
          deviceTokenId: deviceToken.id,
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido.',
        });
      }
    }
  }

  private async log(entry: {
    clientId?: string;
    professionalId?: string;
    eventType: NotificationEventType;
    status: NotificationLogStatus;
    deviceTokenId?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.prisma.notificationLog.create({
      data: {
        clientId: entry.clientId,
        professionalId: entry.professionalId,
        eventType: entry.eventType,
        status: entry.status,
        deviceTokenId: entry.deviceTokenId,
        errorMessage: entry.errorMessage,
      },
    });
  }
}
