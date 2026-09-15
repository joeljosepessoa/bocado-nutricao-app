import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
