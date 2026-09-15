import { IsNumber, IsOptional, Min } from 'class-validator';

export class BioimpedanceManualDto {
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
}
