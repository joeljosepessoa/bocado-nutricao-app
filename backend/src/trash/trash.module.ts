import { Module } from '@nestjs/common';
import { CustomFormsModule } from '../custom-forms/custom-forms.module';
import { DietsModule } from '../diets/diets.module';
import { ReportsModule } from '../reports/reports.module';
import { TemplatesModule } from '../templates/templates.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

@Module({
  imports: [DietsModule, WorkoutsModule, TemplatesModule, CustomFormsModule, ReportsModule],
  controllers: [TrashController],
  providers: [TrashService],
})
export class TrashModule {}
