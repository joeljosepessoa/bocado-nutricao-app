import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FoodScope, NutritionUnit } from '@prisma/client';
import { FoodUnitConversionDto } from './food-unit-conversion.dto';

export class CreateFoodDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEnum(FoodScope)
  scope?: FoodScope;

  @IsIn([NutritionUnit.g, NutritionUnit.ml])
  baseUnit!: NutritionUnit;

  @IsNumber() @Min(0) kcalPer100!: number;
  @IsNumber() @Min(0) proteinGPer100!: number;
  @IsNumber() @Min(0) carbGPer100!: number;
  @IsNumber() @Min(0) fatGPer100!: number;

  @IsOptional() @IsNumber() @Min(0) fiberGPer100?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FoodUnitConversionDto)
  unitConversions?: FoodUnitConversionDto[];
}
