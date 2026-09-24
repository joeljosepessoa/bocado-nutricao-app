import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { LoadUnit } from '@prisma/client';

export class CreateWorkoutSetDto {
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsInt() @Min(0) reps?: number | null;
  @IsOptional() @IsInt() @Min(0) repsMin?: number | null;
  @IsOptional() @IsInt() @Min(0) repsMax?: number | null;
  @IsOptional() @IsNumber() @Min(0) loadValue?: number;
  @IsOptional() @IsEnum(LoadUnit) loadUnit?: LoadUnit;
  @IsOptional() @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @IsNumber() @Min(0) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(0) restSeconds?: number;
  @IsOptional() @IsString() tempo?: string;
  @IsOptional() @IsString() notes?: string;
}
