import { IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDietVersionDto {
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsNumber() @Min(0) targetCalories?: number;
  @IsOptional() @IsNumber() @Min(0) targetProteinG?: number;
  @IsOptional() @IsNumber() @Min(0) targetCarbG?: number;
  @IsOptional() @IsNumber() @Min(0) targetFatG?: number;
}
