import { Module } from '@nestjs/common';
import { FoodsModule } from '../foods/foods.module';
import { DietsController } from './diets.controller';
import { DietsService } from './diets.service';
import { DietAuditLogService } from './diet-audit-log.service';

@Module({
  imports: [FoodsModule],
  controllers: [DietsController],
  providers: [DietsService, DietAuditLogService],
})
export class DietsModule {}
