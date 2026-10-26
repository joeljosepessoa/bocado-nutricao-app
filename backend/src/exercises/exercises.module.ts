import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ExercisesController } from './exercises.controller';
import { ExercisePresetsController } from './presets/exercise-presets.controller';
import { ExercisePresetsService } from './presets/exercise-presets.service';
import { ExerciseMediaController } from './exercise-media.controller';
import { ExercisesService } from './exercises.service';
import { ExerciseMediaStorage } from './exercise-media-storage.service';

@Module({
  imports: [StorageModule],
  controllers: [ExercisesController, ExerciseMediaController, ExercisePresetsController],
  providers: [ExercisesService, ExerciseMediaStorage, ExercisePresetsService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
