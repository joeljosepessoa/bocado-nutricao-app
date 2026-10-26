import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ExerciseScope, ExerciseType } from '@prisma/client';

export class CreateExerciseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() muscleGroup?: string;
  /** Todos os grupos (o 1º vira o principal). */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(60, { each: true }) muscleGroups?: string[];
  @IsOptional() @IsString() equipment?: string;
  @IsOptional() @IsString() instructions?: string;

  @IsEnum(ExerciseType)
  type!: ExerciseType;

  @IsOptional()
  @IsEnum(ExerciseScope)
  scope?: ExerciseScope;

  @IsOptional() @IsUrl() videoUrl?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}
