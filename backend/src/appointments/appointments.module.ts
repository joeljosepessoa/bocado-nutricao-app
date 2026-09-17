import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AvailabilityController } from './availability.controller';
import { AppointmentsController } from './appointments.controller';
import { AvailabilityService } from './availability.service';
import { AppointmentsService } from './appointments.service';
import { AppointmentAuditLogService } from './appointment-audit-log.service';
import { AppointmentReminderService } from './appointment-reminder.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AvailabilityController, AppointmentsController],
  providers: [AvailabilityService, AppointmentsService, AppointmentAuditLogService, AppointmentReminderService],
  exports: [AvailabilityService, AppointmentsService],
})
export class AppointmentsModule {}
