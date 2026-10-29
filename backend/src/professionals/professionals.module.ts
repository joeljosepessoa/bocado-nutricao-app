import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService, AlertsService],
})
export class ProfessionalsModule {}
