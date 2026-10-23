import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DIET_LIMITS as L } from '../../ai/use-cases/organize-diet/organized-diet.schema';
import { ProposalDayDto as DietProposalDayDto, ProposalSupplementDto } from '../../diets/dto/create-diet-from-proposal.dto';
import { CreateWorkoutFromProposalDto } from '../../workouts/dto/create-workout-from-proposal.dto';

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_DESCRIPTION_MAX = 2000;

/** Conteúdo de um modelo de dieta: a mesma proposta que cria o rascunho do paciente, só na estrutura por dia. */
export class DietTemplateContentDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) objective?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxDays)
  @ValidateNested({ each: true })
  @Type(() => DietProposalDayDto)
  days!: DietProposalDayDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.maxSupplements)
  @ValidateNested({ each: true })
  @Type(() => ProposalSupplementDto)
  supplements?: ProposalSupplementDto[];

  @IsOptional() @IsString() @MaxLength(20000) patientGuidelines?: string | null;
}

/** Conteúdo de um modelo de treino: a mesma proposta que cria o treino do paciente. */
export class WorkoutTemplateContentDto extends CreateWorkoutFromProposalDto {}

export class CreateDietTemplateDto {
  @IsString() @Matches(/\S/, { message: 'Dê um nome ao modelo.' }) @MaxLength(TEMPLATE_NAME_MAX) name!: string;
  @IsOptional() @IsString() @MaxLength(TEMPLATE_DESCRIPTION_MAX) description?: string | null;
  @ValidateNested() @Type(() => DietTemplateContentDto) content!: DietTemplateContentDto;
}

export class UpdateDietTemplateDto {
  @IsOptional() @IsString() @Matches(/\S/, { message: 'Dê um nome ao modelo.' }) @MaxLength(TEMPLATE_NAME_MAX) name?: string;
  @IsOptional() @IsString() @MaxLength(TEMPLATE_DESCRIPTION_MAX) description?: string | null;
  @IsOptional() @ValidateNested() @Type(() => DietTemplateContentDto) content?: DietTemplateContentDto;
}

export class CreateWorkoutTemplateDto {
  @IsString() @Matches(/\S/, { message: 'Dê um nome ao modelo.' }) @MaxLength(TEMPLATE_NAME_MAX) name!: string;
  @IsOptional() @IsString() @MaxLength(TEMPLATE_DESCRIPTION_MAX) description?: string | null;
  @ValidateNested() @Type(() => WorkoutTemplateContentDto) content!: WorkoutTemplateContentDto;
}

export class UpdateWorkoutTemplateDto {
  @IsOptional() @IsString() @Matches(/\S/, { message: 'Dê um nome ao modelo.' }) @MaxLength(TEMPLATE_NAME_MAX) name?: string;
  @IsOptional() @IsString() @MaxLength(TEMPLATE_DESCRIPTION_MAX) description?: string | null;
  @IsOptional() @ValidateNested() @Type(() => WorkoutTemplateContentDto) content?: WorkoutTemplateContentDto;
}

/** Atribuir o modelo a um paciente: vira RASCUNHO na ficha dele (nunca publica). */
export class ApplyTemplateDto {
  @IsUUID() clientId!: string;
  /** Dieta: o paciente já tem rascunho aberto — só substitui com confirmação explícita. */
  @IsOptional() @IsBoolean() replaceDraft?: boolean;
}

export class ListTemplatesQueryDto {
  @IsOptional() @IsIn(['true', 'false']) trash?: 'true' | 'false';
}

/** "Salvar como modelo": copia a dieta/treino atual do paciente (rascunho, se houver; senão a publicada) para a biblioteca. */
export class TemplateFromClientDto {
  @IsUUID() clientId!: string;
  @IsString() @Matches(/\S/, { message: 'Dê um nome ao modelo.' }) @MaxLength(TEMPLATE_NAME_MAX) name!: string;
  @IsOptional() @IsString() @MaxLength(TEMPLATE_DESCRIPTION_MAX) description?: string | null;
}
