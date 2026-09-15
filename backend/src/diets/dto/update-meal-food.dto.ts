import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { NutritionUnit } from '@prisma/client';

export class UpdateMealFoodDto {
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsEnum(NutritionUnit) unit?: NutritionUnit;
  @IsOptional() @IsString() notes?: string;
}
