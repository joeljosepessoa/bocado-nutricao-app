import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PhysicalEvaluationsController } from './physical-evaluations.controller';
import { PhysicalEvaluationsService } from './physical-evaluations.service';
import { CalculationService } from './calculation.service';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [StorageModule],
  controllers: [PhysicalEvaluationsController],
  providers: [PhysicalEvaluationsService, CalculationService, AuditLogService],
})
export class PhysicalEvaluationsModule {}
