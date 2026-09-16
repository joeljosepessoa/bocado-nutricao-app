import { Module } from '@nestjs/common';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { ScaleReadingsController } from './scale-readings.controller';
import { ScaleReadingsService } from './scale-readings.service';
import { ScaleAuditLogService } from './scale-audit-log.service';

@Module({
  imports: [PhysicalEvaluationsModule],
  controllers: [ScaleReadingsController],
  providers: [ScaleReadingsService, ScaleAuditLogService],
})
export class ScaleReadingsModule {}
