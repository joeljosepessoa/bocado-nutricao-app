import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ExercisesController } from './exercises.controller';
import { ExerciseMediaController } from './exercise-media.controller';
import { ExercisesService } from './exercises.service';
import { ExerciseMediaStorage } from './exercise-media-storage.service';

@Module({
  imports: [StorageModule],
  controllers: [ExercisesController, ExerciseMediaController],
  providers: [ExercisesService, ExerciseMediaStorage],
  exports: [ExercisesService],
})
export class ExercisesModule {}
