import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** "+ Preset": exercício + séries (repetições exatas OU faixa) + descanso. */
export class CreateExercisePresetDto {
  @IsUUID() exerciseId!: string;
  @IsInt() @Min(1) @Max(20) sets!: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) reps?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1000) repsMin?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1000) repsMax?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(3600) restSeconds?: number | null;
}
