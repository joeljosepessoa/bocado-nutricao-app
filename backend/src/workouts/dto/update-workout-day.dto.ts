import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateWorkoutDayDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() notes?: string;
}
