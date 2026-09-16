import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminProfessionalsController } from './admin-professionals.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminProfessionalsService } from './admin-professionals.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminAuditLogService } from './admin-audit-log.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminProfessionalsController, AdminModerationController, AdminMetricsController],
  providers: [AdminProfessionalsService, AdminModerationService, AdminMetricsService, AdminAuditLogService],
})
export class AdminModule {}
