import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { DietsModule } from '../diets/diets.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { UsersModule } from '../users/users.module';
import { ReportsModule } from '../reports/reports.module';
import { MessagesModule } from '../messages/messages.module';
import { ClientAppController } from './client-app.controller';
import { ClientAppService } from './client-app.service';

@Module({
  imports: [ClientsModule, DietsModule, WorkoutsModule, PhysicalEvaluationsModule, UsersModule, ReportsModule, MessagesModule],
  controllers: [ClientAppController],
  providers: [ClientAppService],
})
export class ClientAppModule {}
