import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';
import { WorkoutAuditLogService } from './workout-audit-log.service';

@Module({
  imports: [ExercisesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutAuditLogService],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
