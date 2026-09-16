import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationEventType } from '@prisma/client';

export class UpdateNotificationPreferenceDto {
  @IsEnum(NotificationEventType)
  eventType!: NotificationEventType;

  @IsBoolean()
  enabled!: boolean;
}
