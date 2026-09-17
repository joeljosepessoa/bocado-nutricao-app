import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DietsModule } from '../diets/diets.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { PhysicalEvaluationsModule } from '../physical-evaluations/physical-evaluations.module';
import { ReportsModule } from '../reports/reports.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LgpdService } from './lgpd.service';

@Module({
  imports: [
    AuthModule,
    ClientsModule,
    DietsModule,
    WorkoutsModule,
    PhysicalEvaluationsModule,
    ReportsModule,
    AppointmentsModule,
    DevicesModule,
    NotificationsModule,
  ],
  providers: [LgpdService],
  exports: [LgpdService],
})
export class LgpdModule {}
