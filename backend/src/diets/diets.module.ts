import { Module } from '@nestjs/common';
import { FoodsModule } from '../foods/foods.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DietsController } from './diets.controller';
import { DietsService } from './diets.service';
import { DietAuditLogService } from './diet-audit-log.service';
import { DietStructureController } from './diet-structure.controller';
import { DietStructureService } from './diet-structure.service';

@Module({
  imports: [FoodsModule, NotificationsModule],
  controllers: [DietsController, DietStructureController],
  providers: [DietsService, DietAuditLogService, DietStructureService],
  exports: [DietsService],
})
export class DietsModule {}
