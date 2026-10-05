import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NutritionUnit } from '@prisma/client';
import { DIET_LIMITS as L } from '../../ai/use-cases/organize-diet/organized-diet.schema';

// A ordem de refeições e alimentos é a posição na lista revisada pelo
// profissional — por isso não há campo `order` aqui.

export class ProposalMealFoodDto {
  @IsUUID()
  foodId!: string;

  @IsNumber()
  @IsPositive()
  @Max(L.maxQuantity)
  quantity!: number;

  @IsEnum(NutritionUnit)
  unit!: NutritionUnit;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;
}

export class ProposalMealDto {
  @IsString()
  @Matches(/\S/, { message: 'Informe o nome da refeição.' })
  @MaxLength(L.maxNameLength)
  name!: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'time deve estar no formato HH:mm.' })
  time?: string | null;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxItemsPerMeal)
  @ValidateNested({ each: true })
  @Type(() => ProposalMealFoodDto)
  foods!: ProposalMealFoodDto[];
}

/**
 * Proposta já revisada pelo profissional (ex.: saída do Assistente de Dieta).
 * Vira um RASCUNHO — nunca é publicada aqui. Se a dieta ativa já tiver um
 * rascunho aberto, só o substitui com `replaceDraft: true` (confirmação
 * explícita no painel); versão publicada nunca é tocada.
 */
export class CreateDietFromProposalDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) objective?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() replaceDraft?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxMeals)
  @ValidateNested({ each: true })
  @Type(() => ProposalMealDto)
  meals!: ProposalMealDto[];
}
