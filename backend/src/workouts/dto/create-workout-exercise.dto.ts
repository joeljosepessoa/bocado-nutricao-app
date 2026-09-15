import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateWorkoutExerciseDto {
  @IsUUID()
  exerciseId!: string;

  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() notes?: string;
}
