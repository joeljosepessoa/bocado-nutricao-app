import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LoadUnit } from '@prisma/client';

export class CreateExecutionSetDto {
  @IsUUID()
  workoutExerciseId!: string;

  @IsInt()
  @Min(1)
  setOrder!: number;

  @IsOptional() @IsInt() @Min(0) repsPerformed?: number;
  @IsOptional() @IsNumber() @Min(0) loadValue?: number;
  @IsOptional() @IsEnum(LoadUnit) loadUnit?: LoadUnit;
  @IsOptional() @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @IsNumber() @Min(0) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) perceivedEffort?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateExecutionLogDto {
  @IsUUID()
  workoutDayId!: string;

  @IsOptional()
  @IsISO8601()
  performedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExecutionSetDto)
  sets!: CreateExecutionSetDto[];
}
