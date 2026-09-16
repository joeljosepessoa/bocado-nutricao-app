import { Injectable } from '@nestjs/common';
import { NotificationEventType, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

function ownerFilter(user: AuthenticatedUser): { clientId: string } | { professionalId: string } {
  return user.role === Role.client ? { clientId: user.id } : { professionalId: user.id };
}

export interface NotificationPreferenceView {
  eventType: NotificationEventType;
  enabled: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sempre retorna os 4 tipos de evento, preenchendo com enabled:true
   * quando não existe linha ainda — mesma regra de "ausência = permitido"
   * usada em NotificationDispatchService, pra a tela nunca mostrar um
   * estado diferente do que o disparo realmente vai usar.
   */
  async list(user: AuthenticatedUser): Promise<NotificationPreferenceView[]> {
    const owner = ownerFilter(user);
    const rows = await this.prisma.notificationPreference.findMany({ where: owner });
    const byType = new Map(rows.map((row) => [row.eventType, row.enabled]));

    return Object.values(NotificationEventType).map((eventType) => ({
      eventType,
      enabled: byType.get(eventType) ?? true,
    }));
  }

  async update(user: AuthenticatedUser, dto: UpdateNotificationPreferenceDto): Promise<NotificationPreferenceView> {
    const owner = ownerFilter(user);

    if ('clientId' in owner) {
      await this.prisma.notificationPreference.upsert({
        where: { clientId_eventType: { clientId: owner.clientId, eventType: dto.eventType } },
        update: { enabled: dto.enabled },
        create: { clientId: owner.clientId, eventType: dto.eventType, enabled: dto.enabled },
      });
    } else {
      await this.prisma.notificationPreference.upsert({
        where: { professionalId_eventType: { professionalId: owner.professionalId, eventType: dto.eventType } },
        update: { enabled: dto.enabled },
        create: { professionalId: owner.professionalId, eventType: dto.eventType, enabled: dto.enabled },
      });
    }

    return { eventType: dto.eventType, enabled: dto.enabled };
  }
}
