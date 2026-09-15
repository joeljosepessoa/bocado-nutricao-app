import { IsNumber, IsPositive, IsEnum } from 'class-validator';
import { NutritionUnit } from '@prisma/client';

export class FoodUnitConversionDto {
  @IsEnum(NutritionUnit)
  unit!: NutritionUnit;

  @IsNumber()
  @IsPositive()
  gramsEquivalent!: number;
}
