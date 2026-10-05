import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { WORKOUT_LIMITS } from '../workout-limits';

/** Nova ordem de TODOS os dias da versão (id na posição = ordem). */
export class ReorderWorkoutDaysDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(WORKOUT_LIMITS.maxDays * 4)
  @IsUUID('all', { each: true })
  dayIds!: string[];
}

/** Nova ordem de TODOS os exercícios do dia. */
export class ReorderWorkoutExercisesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(WORKOUT_LIMITS.maxExercisesPerDay * 4)
  @IsUUID('all', { each: true })
  workoutExerciseIds!: string[];
}
