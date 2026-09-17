import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { DeviceTokensService } from './device-tokens.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationService } from './notification.service';
import { ConsoleNotificationService } from './console-notification.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    DeviceTokensService,
    NotificationPreferencesService,
    NotificationDispatchService,
    ConsoleNotificationService,
    { provide: NotificationService, useExisting: ConsoleNotificationService },
  ],
  exports: [NotificationDispatchService, NotificationPreferencesService],
})
export class NotificationsModule {}
