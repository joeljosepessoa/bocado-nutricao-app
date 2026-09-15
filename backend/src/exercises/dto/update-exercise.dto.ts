import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ExerciseType } from '@prisma/client';

export class UpdateExerciseDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() muscleGroup?: string;
  @IsOptional() @IsString() equipment?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsEnum(ExerciseType) type?: ExerciseType;
  @IsOptional() @IsUrl() videoUrl?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}
