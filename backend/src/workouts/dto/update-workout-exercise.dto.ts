import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateWorkoutExerciseDto {
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() notes?: string;
}
