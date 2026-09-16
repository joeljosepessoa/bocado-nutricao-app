import { IsNumber, IsObject, IsOptional, Min } from 'class-validator';

/**
 * Mesmo shape de BioimpedanceManualDto — mapeamento 1:1 intencional (Fase 10,
 * §04 do desenho): o que o driver decodifica é exatamente o que Bioimpedance
 * já sabe guardar. Campo que o aparelho não envia fica ausente, nunca 0.
 */
export class NormalizedScaleReadingDto {
  @IsOptional() @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @IsNumber() @Min(0) bodyFatPercent?: number;
  @IsOptional() @IsNumber() @Min(0) fatMassKg?: number;
  @IsOptional() @IsNumber() @Min(0) leanMassKg?: number;
  @IsOptional() @IsNumber() @Min(0) skeletalMuscleMassKg?: number;
  @IsOptional() @IsNumber() @Min(0) muscleMassKg?: number;
  @IsOptional() @IsNumber() @Min(0) bodyWaterPercent?: number;
  @IsOptional() @IsNumber() @Min(0) visceralFatLevel?: number;
  @IsOptional() @IsNumber() @Min(0) basalMetabolicRateKcal?: number;
  @IsOptional() @IsNumber() @Min(0) bodyAgeYears?: number;
  @IsOptional() @IsNumber() @Min(0) boneMassKg?: number;

  @IsOptional() @IsObject() segmentalData?: Record<string, unknown>;
  @IsOptional() @IsObject() impedanceData?: Record<string, unknown>;
}
