import { IsEnum } from 'class-validator';
import { WorkoutStatus } from '@prisma/client';

export class UpdateWorkoutDto {
  @IsEnum(WorkoutStatus)
  status!: WorkoutStatus;
}
