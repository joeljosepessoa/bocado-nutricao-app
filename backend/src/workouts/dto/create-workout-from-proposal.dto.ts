import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LoadUnit } from '@prisma/client';
import { WORKOUT_LIMITS as L } from '../workout-limits';

// A ordem de dias, exercícios e séries é a posição na lista revisada pelo
// profissional — por isso não há campo `order` aqui.

export class ProposalSetDto {
  @IsOptional() @IsInt() @Min(1) @Max(L.maxReps) reps?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(L.maxReps) repsMin?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(L.maxReps) repsMax?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(L.maxLoadValue) loadValue?: number | null;
  @IsOptional() @IsEnum(LoadUnit) loadUnit?: LoadUnit | null;
  @IsOptional() @IsInt() @Min(1) @Max(L.maxDurationSeconds) durationSeconds?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(L.maxDistanceMeters) distanceMeters?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(L.maxRestSeconds) restSeconds?: number | null;
  @IsOptional() @IsString() @MaxLength(L.maxTempoLength) tempo?: string | null;
  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;
}

export class ProposalExerciseDto {
  @IsUUID()
  exerciseId!: string;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxSetsPerExercise)
  @ValidateNested({ each: true })
  @Type(() => ProposalSetDto)
  sets!: ProposalSetDto[];
}

export class ProposalDayDto {
  @IsString()
  @Matches(/\S/, { message: 'Informe o nome do dia.' })
  @MaxLength(L.maxNameLength)
  name!: string;

  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string | null;

  @IsArray()
  @ArrayMaxSize(L.maxExercisesPerDay)
  @ValidateNested({ each: true })
  @Type(() => ProposalExerciseDto)
  exercises!: ProposalExerciseDto[];
}

/** Proposta já revisada pelo profissional — vira um treino NOVO em rascunho, nunca publicado aqui. */
export class CreateWorkoutFromProposalDto {
  @IsOptional() @IsString() @MaxLength(L.maxNameLength) objective?: string;
  @IsOptional() @IsString() @MaxLength(L.maxNotesLength) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.maxDays)
  @ValidateNested({ each: true })
  @Type(() => ProposalDayDto)
  days!: ProposalDayDto[];
}
