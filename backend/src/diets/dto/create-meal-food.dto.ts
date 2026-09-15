import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { NutritionUnit } from '@prisma/client';

export class CreateMealFoodDto {
  @IsUUID()
  foodId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsEnum(NutritionUnit)
  unit!: NutritionUnit;

  @IsOptional()
  @IsString()
  notes?: string;
}
