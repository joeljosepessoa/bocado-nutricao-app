import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';
import { WorkoutAuditLogService } from './workout-audit-log.service';

@Module({
  imports: [ExercisesModule, NotificationsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutAuditLogService],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
