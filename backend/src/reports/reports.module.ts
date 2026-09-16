import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { EvaluationReportsController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportAuditLogService } from './report-audit-log.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [StorageModule, PhysicalEvaluationsModule],
  controllers: [ReportsController, EvaluationReportsController],
  providers: [ReportsService, ReportAuditLogService, PdfService],
  exports: [ReportsService],
})
export class ReportsModule {}
