import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { DeviceMetricType, Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DevicesService, RequestMeta } from './devices.service';
import { CreateDeviceConnectionDto } from './dto/create-device-connection.dto';
import { UpdateDeviceConnectionDto } from './dto/update-device-connection.dto';
import { IngestMetricSamplesDto } from './dto/ingest-metric-samples.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('client/devices')
@Roles(Role.client)
export class ClientDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('consent')
  async recordConsent(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.devicesService.recordConsent(user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listOwnConnections(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDeviceConnectionDto, @Req() req: Request) {
    return this.devicesService.createConnection(user.id, dto, meta(req));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceConnectionDto,
    @Req() req: Request,
  ) {
    return this.devicesService.updateConnection(user.id, id, dto, meta(req));
  }

  @Post(':id/metrics')
  ingestMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: IngestMetricSamplesDto,
    @Req() req: Request,
  ) {
    return this.devicesService.ingestMetrics(user.id, id, dto, meta(req));
  }

  @Get(':id/metrics')
  listOwnMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('metricType') metricType: DeviceMetricType | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    return this.devicesService.listOwnMetrics(
      user.id,
      id,
      metricType,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }
}

@Controller('clients/:clientId/devices')
@Roles(Role.professional)
export class ProfessionalDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string) {
    return this.devicesService.listConnectionsForProfessional(user.id, clientId);
  }

  @Get('metrics')
  listMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('metricType') metricType: DeviceMetricType | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() req: Request,
  ) {
    return this.devicesService.listMetricsForProfessional(
      user.id,
      clientId,
      metricType,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
      meta(req),
    );
  }
}
