import { Module } from '@nestjs/common';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';
import { NutritionCalculationService } from './nutrition-calculation.service';

@Module({
  controllers: [FoodsController],
  providers: [FoodsService, NutritionCalculationService],
  exports: [FoodsService, NutritionCalculationService],
})
export class FoodsModule {}
