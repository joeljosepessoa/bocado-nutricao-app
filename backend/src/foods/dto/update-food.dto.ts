import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { NutritionUnit } from '@prisma/client';
import { FoodUnitConversionDto } from './food-unit-conversion.dto';

export class UpdateFoodDto {
  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsIn([NutritionUnit.g, NutritionUnit.ml]) baseUnit?: NutritionUnit;
  @IsOptional() @IsNumber() @Min(0) kcalPer100?: number;
  @IsOptional() @IsNumber() @Min(0) proteinGPer100?: number;
  @IsOptional() @IsNumber() @Min(0) carbGPer100?: number;
  @IsOptional() @IsNumber() @Min(0) fatGPer100?: number;
  @IsOptional() @IsNumber() @Min(0) fiberGPer100?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FoodUnitConversionDto)
  unitConversions?: FoodUnitConversionDto[];
}
