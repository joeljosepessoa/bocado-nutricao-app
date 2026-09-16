import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeviceMetricType } from '@prisma/client';

export class MetricSampleInputDto {
  @IsEnum(DeviceMetricType)
  metricType!: DeviceMetricType;

  @IsNumber()
  value!: number;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsISO8601()
  startedAt!: string;

  @IsISO8601()
  endedAt!: string;

  @IsOptional()
  @IsNumber()
  precision?: number;

  /** Id do evento na fonte (HealthKit/Health Connect sempre fornecem um) — usado no cálculo de dedupHash. */
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class IngestMetricSamplesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MetricSampleInputDto)
  samples!: MetricSampleInputDto[];
}
