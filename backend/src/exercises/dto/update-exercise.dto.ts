import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ExerciseType } from '@prisma/client';

export class UpdateExerciseDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() muscleGroup?: string;
  /** Todos os grupos (o 1º vira o principal). Lista vazia = "Sem grupos definidos". */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(60, { each: true }) muscleGroups?: string[];
  @IsOptional() @IsString() equipment?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsEnum(ExerciseType) type?: ExerciseType;
  @IsOptional() @IsUrl() videoUrl?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}
