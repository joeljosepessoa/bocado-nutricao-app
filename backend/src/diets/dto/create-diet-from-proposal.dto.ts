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
import { DietDayKind, MealGroupKind, NutritionUnit } from '@prisma/client';
import { DIET_LIMITS as L } from '../../ai/use-cases/organize-diet/organized-diet.schema';

// A ordem de dias, refeições, grupos, escolhas e alimentos é a posição na
// lista revisada pelo profissional — por isso não há campo `order` aqui.

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Formato antigo (refeições com alimentos do catálogo) — mantido por compatibilidade. */
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
  @Matches(TIME, { message: 'time deve estar no formato HH:mm.' })
  time?: string | null;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxItemsPerMeal)
  @ValidateNested({ each: true })
  @Type(() => ProposalMealFoodDto)
  foods!: ProposalMealFoodDto[];
}

// --- Estrutura nova (P3): dias → refeições → grupos → escolhas → itens ------

/** Item: nome escrito (customFoodName, o que o paciente vê) e/ou catálogo (foodId, só para o cálculo); faixa e "à vontade". Regras cruzadas no serviço. */
export class ProposalChoiceFoodDto {
  @IsOptional() @IsUUID() foodId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(L.maxNameLength) customFoodName?: string;
  @IsOptional() @IsNumber() @IsPositive() @Max(L.maxQuantity) quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() @Max(L.maxQuantity) quantityMax?: number;
  @IsOptional() @IsEnum(NutritionUnit) unit?: NutritionUnit;
  @IsOptional() @IsBoolean() isFreeQuantity?: boolean;
  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;
}

export class ProposalChoiceDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) label?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxItemsPerChoice)
  @ValidateNested({ each: true })
  @Type(() => ProposalChoiceFoodDto)
  foods!: ProposalChoiceFoodDto[];
}

export class ProposalGroupDto {
  @IsEnum(MealGroupKind) kind!: MealGroupKind;
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) label?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxChoicesPerGroup)
  @ValidateNested({ each: true })
  @Type(() => ProposalChoiceDto)
  choices!: ProposalChoiceDto[];
}

export class ProposalStructuredMealDto {
  @IsString()
  @Matches(/\S/, { message: 'Informe o nome da refeição.' })
  @MaxLength(L.maxNameLength)
  name!: string;

  @IsOptional()
  @Matches(TIME, { message: 'time deve estar no formato HH:mm.' })
  time?: string | null;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxGroupsPerMeal)
  @ValidateNested({ each: true })
  @Type(() => ProposalGroupDto)
  groups!: ProposalGroupDto[];
}

export class ProposalDayDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) label?: string | null;
  @IsOptional() @IsEnum(DietDayKind) kind?: DietDayKind;
  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) usageNotes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxMeals)
  @ValidateNested({ each: true })
  @Type(() => ProposalStructuredMealDto)
  meals!: ProposalStructuredMealDto[];
}

export class ProposalSupplementDto {
  @IsString() @Matches(/\S/, { message: 'Informe o nome do suplemento.' }) @MaxLength(L.maxNameLength) name!: string;
  @IsOptional() @IsNumber() @IsPositive() @Max(L.maxQuantity) quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() @Max(L.maxQuantity) quantityMax?: number;
  @IsOptional() @IsString() @MaxLength(60) unitText?: string | null;
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) timing?: string | null;
  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;
}

/**
 * Proposta já revisada pelo profissional (ex.: saída do Assistente de Dieta).
 * Vira um RASCUNHO — nunca é publicada aqui. Se a dieta ativa já tiver um
 * rascunho aberto, só o substitui com `replaceDraft: true` (confirmação
 * explícita no painel); versão publicada nunca é tocada.
 * Conteúdo: `days` (estrutura nova) OU `meals` (formato antigo) — um dos dois.
 */
export class CreateDietFromProposalDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) objective?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() replaceDraft?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxMeals)
  @ValidateNested({ each: true })
  @Type(() => ProposalMealDto)
  meals?: ProposalMealDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxDays)
  @ValidateNested({ each: true })
  @Type(() => ProposalDayDto)
  days?: ProposalDayDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.maxSupplements)
  @ValidateNested({ each: true })
  @Type(() => ProposalSupplementDto)
  supplements?: ProposalSupplementDto[];

  /** Orientações ao paciente (≠ notes, interno). */
  @IsOptional() @IsString() @MaxLength(20000) patientGuidelines?: string | null;
}
