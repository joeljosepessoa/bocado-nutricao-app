import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { ExerciseScope, ExerciseType } from '@prisma/client';

export class CreateExerciseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() muscleGroup?: string;
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
