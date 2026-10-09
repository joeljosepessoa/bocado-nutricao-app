import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ClientTrackingController } from './client-tracking.controller';
import { ClientTrackingService } from './client-tracking.service';
import { ProfessionalTrackingController } from './professional-tracking.controller';

@Module({
  imports: [StorageModule],
  controllers: [ClientTrackingController, ProfessionalTrackingController],
  providers: [ClientTrackingService],
  exports: [ClientTrackingService],
})
export class ClientTrackingModule {}
