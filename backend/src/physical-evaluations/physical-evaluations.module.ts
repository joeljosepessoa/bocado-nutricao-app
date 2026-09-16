import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PhysicalEvaluationsController } from './physical-evaluations.controller';
import { PhysicalEvaluationsService } from './physical-evaluations.service';
import { CalculationService } from './calculation.service';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [PhysicalEvaluationsController],
  providers: [PhysicalEvaluationsService, CalculationService, AuditLogService],
  exports: [PhysicalEvaluationsService],
})
export class PhysicalEvaluationsModule {}
