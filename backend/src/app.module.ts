import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ErrorTrackingModule } from './error-tracking/error-tracking.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ClientsModule } from './clients/clients.module';
import { PhysicalEvaluationsModule } from './physical-evaluations/physical-evaluations.module';
import { StorageModule } from './storage/storage.module';
import { FoodsModule } from './foods/foods.module';
import { DietsModule } from './diets/diets.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { ClientAppModule } from './client-app/client-app.module';
import { ReportsModule } from './reports/reports.module';
import { ScaleReadingsModule } from './scale-readings/scale-readings.module';
import { DevicesModule } from './devices/devices.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { AppointmentsModule } from './appointments/appointments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ErrorTrackingModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfessionalsModule,
    ClientsModule,
    PhysicalEvaluationsModule,
    StorageModule,
    FoodsModule,
    DietsModule,
    ExercisesModule,
    WorkoutsModule,
    ClientAppModule,
    ReportsModule,
    ScaleReadingsModule,
    DevicesModule,
    AiModule,
    AdminModule,
    NotificationsModule,
    MessagesModule,
    AppointmentsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
