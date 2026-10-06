import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from 'class-validator';
import { NutritionUnit } from '@prisma/client';

export class UpdateMealFoodDto {
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsEnum(NutritionUnit) unit?: NutritionUnit;
  @IsOptional() @IsString() notes?: string;
  /** null limpa a faixa. */
  @IsOptional() @ValidateIf((o) => o.quantityMax !== null) @IsNumber() @IsPositive() quantityMax?: number | null;
  /** "À vontade": sem quantidade e fora da soma nutricional. */
  @IsOptional() @IsBoolean() isFreeQuantity?: boolean;
}
