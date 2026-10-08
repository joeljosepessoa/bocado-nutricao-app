import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ClientTrackingController } from './client-tracking.controller';
import { ClientTrackingService } from './client-tracking.service';

@Module({
  imports: [StorageModule],
  controllers: [ClientTrackingController],
  providers: [ClientTrackingService],
  exports: [ClientTrackingService],
})
export class ClientTrackingModule {}
