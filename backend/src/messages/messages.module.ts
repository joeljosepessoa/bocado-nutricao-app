import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessageAuditLogService } from './message-audit-log.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageAuditLogService],
  exports: [MessagesService],
})
export class MessagesModule {}
