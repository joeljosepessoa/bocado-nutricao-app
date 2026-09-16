import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminMetricsService } from './admin-metrics.service';

@Controller('admin/metrics')
@Roles(Role.admin)
export class AdminMetricsController {
  constructor(private readonly metricsService: AdminMetricsService) {}

  @Get()
  getMetrics() {
    return this.metricsService.getMetrics();
  }
}
