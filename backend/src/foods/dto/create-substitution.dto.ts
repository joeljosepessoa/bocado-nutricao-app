import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { NutritionUnit } from '@prisma/client';

export class CreateSubstitutionDto {
  @IsUUID()
  substituteFoodId!: string;

  @IsNumber()
  @IsPositive()
  substituteQuantity!: number;

  @IsEnum(NutritionUnit)
  substituteUnit!: NutritionUnit;

  @IsOptional()
  @IsString()
  notes?: string;
}
