import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { DietDayKind, MealGroupKind, NutritionUnit } from '@prisma/client';

const NAME = 160;
const NOTES = 2000;

export class CreateDietDayDto {
  /** "Dia de treino", "Dia de descanso"… (vazio = dia único). */
  @IsOptional() @IsString() @MaxLength(NAME) label?: string;
  @IsOptional() @IsEnum(DietDayKind) kind?: DietDayKind;
  @IsOptional() @IsString() @MaxLength(NOTES) usageNotes?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateDietDayDto extends CreateDietDayDto {}

export class CreateMealGroupDto {
  /** fixed = tudo é consumido; meal_options = opções completas da refeição; alternatives = bloco "escolher 1". */
  @IsEnum(MealGroupKind) kind!: MealGroupKind;
  @IsOptional() @IsString() @MaxLength(NAME) label?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateMealGroupDto {
  @IsOptional() @IsEnum(MealGroupKind) kind?: MealGroupKind;
  @IsOptional() @IsString() @MaxLength(NAME) label?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class CreateMealChoiceDto {
  /** "Opção 1", "Arroz"… */
  @IsOptional() @IsString() @MaxLength(NAME) label?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateMealChoiceDto extends CreateMealChoiceDto {}

/**
 * Item de uma escolha: do catálogo (foodId) OU nome livre (customFoodName,
 * sem cálculo). Quantidade opcional: "à vontade" (isFreeQuantity) ou faixa
 * (quantity..quantityMax). Regras cruzadas são conferidas no serviço.
 */
export class CreateChoiceFoodDto {
  @IsOptional() @IsUUID() foodId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(NAME) customFoodName?: string;
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() quantityMax?: number;
  @IsOptional() @IsEnum(NutritionUnit) unit?: NutritionUnit;
  @IsOptional() @IsBoolean() isFreeQuantity?: boolean;
  @IsOptional() @IsString() @MaxLength(NOTES) notes?: string;
}

export class CreateDietSupplementDto {
  @IsString() @Matches(/\S/) @MaxLength(NAME) name!: string;
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() quantityMax?: number;
  /** Texto livre: "g", "cápsula", "scoop"… */
  @IsOptional() @IsString() @MaxLength(60) unitText?: string;
  /** Momento: "antes do café da manhã", "no almoço"… */
  @IsOptional() @IsString() @MaxLength(NAME) timing?: string;
  @IsOptional() @IsString() @MaxLength(NOTES) notes?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateDietSupplementDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(NAME) name?: string;
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() quantityMax?: number;
  @IsOptional() @IsString() @MaxLength(60) unitText?: string;
  @IsOptional() @IsString() @MaxLength(NAME) timing?: string;
  @IsOptional() @IsString() @MaxLength(NOTES) notes?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}
