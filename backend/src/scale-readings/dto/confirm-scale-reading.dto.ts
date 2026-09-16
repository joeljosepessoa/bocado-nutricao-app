import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { ScaleReadingStatus } from '@prisma/client';
import { NormalizedScaleReadingDto } from './normalized-scale-reading.dto';

export class ConfirmScaleReadingDto {
  @IsEnum(ScaleReadingStatus)
  status!: ScaleReadingStatus;

  @IsString()
  @MinLength(1)
  driverId!: string;

  @IsString()
  @MinLength(1)
  deviceIdentifier!: string;

  @IsString()
  @MinLength(1)
  protocolVersion!: string;

  @IsISO8601()
  recordedAt!: string;

  /** Gerada no app a partir da leitura em si (não do envio) — retry seguro. */
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  /** Bytes do payload BLE, preservados sem reinterpretação. */
  @IsObject()
  rawPayload!: Record<string, unknown>;

  /** Obrigatório quando status = confirmed; ausente/ignorado quando discarded. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NormalizedScaleReadingDto)
  normalized?: NormalizedScaleReadingDto;
}
