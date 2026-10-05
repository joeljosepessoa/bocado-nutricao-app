import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateWorkoutExerciseDto {
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsString() notes?: string;
  /** Trocar por outro exercício do catálogo (precisa ser visível ao profissional). */
  @IsOptional() @IsUUID() exerciseId?: string;
}
