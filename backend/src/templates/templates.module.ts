import { Module } from '@nestjs/common';
import { DietsModule } from '../diets/diets.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { FoodsModule } from '../foods/foods.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { ClientContentController, DietTemplatesController, WorkoutTemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [DietsModule, WorkoutsModule, FoodsModule, ExercisesModule],
  controllers: [DietTemplatesController, WorkoutTemplatesController, ClientContentController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
