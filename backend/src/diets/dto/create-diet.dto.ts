import { IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDietDto {
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() objective?: string;
  /** Orientações gerais VISÍVEIS ao paciente (≠ notes, interno). */
  @IsOptional() @IsString() @MaxLength(20000) patientGuidelines?: string;
  @IsOptional() @IsNumber() @Min(0) targetCalories?: number;
  @IsOptional() @IsNumber() @Min(0) targetProteinG?: number;
  @IsOptional() @IsNumber() @Min(0) targetCarbG?: number;
  @IsOptional() @IsNumber() @Min(0) targetFatG?: number;
}
