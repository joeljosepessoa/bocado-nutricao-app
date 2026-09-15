import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { EvaluationBiologicalSex } from '@prisma/client';
import { MeasurementsDto } from './measurements.dto';
import { SkinfoldsDto } from './skinfolds.dto';
import { BioimpedanceManualDto } from './bioimpedance-manual.dto';

export class UpdateEvaluationDto {
  @IsOptional() @IsISO8601() evaluatedAt?: string;
  @IsOptional() @IsInt() @Min(0) ageAtEvaluation?: number;
  @IsOptional() @IsEnum(EvaluationBiologicalSex) biologicalSexForCalculation?: EvaluationBiologicalSex;
  @IsOptional() @IsNumber() @Min(30) heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @IsString() protocolCode?: string;
  @IsOptional() @IsInt() @Min(0) bloodPressureSystolic?: number;
  @IsOptional() @IsInt() @Min(0) bloodPressureDiastolic?: number;
  @IsOptional() @IsInt() @Min(0) heartRate?: number;
  @IsOptional() @IsNumber() @Min(0) glucose?: number;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MeasurementsDto)
  measurements?: MeasurementsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SkinfoldsDto)
  skinfolds?: SkinfoldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BioimpedanceManualDto)
  bioimpedance?: BioimpedanceManualDto;
}
