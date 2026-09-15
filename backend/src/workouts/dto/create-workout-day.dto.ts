import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateWorkoutDayDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() notes?: string;
}
