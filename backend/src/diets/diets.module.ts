import { Module } from '@nestjs/common';
import { FoodsModule } from '../foods/foods.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DietsController } from './diets.controller';
import { DietsService } from './diets.service';
import { DietAuditLogService } from './diet-audit-log.service';

@Module({
  imports: [FoodsModule, NotificationsModule],
  controllers: [DietsController],
  providers: [DietsService, DietAuditLogService],
  exports: [DietsService],
})
export class DietsModule {}
