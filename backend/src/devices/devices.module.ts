import { Module } from '@nestjs/common';
import { ClientDevicesController, ProfessionalDevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceAuditLogService } from './device-audit-log.service';

@Module({
  controllers: [ClientDevicesController, ProfessionalDevicesController],
  providers: [DevicesService, DeviceAuditLogService],
})
export class DevicesModule {}
