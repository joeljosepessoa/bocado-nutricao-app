import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateWorkoutDto {
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() notes?: string;
}
