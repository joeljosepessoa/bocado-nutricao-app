import { Module } from '@nestjs/common';
import { AnamnesisController } from './anamnesis.controller';
import { AnamnesisService } from './anamnesis.service';

@Module({
  controllers: [AnamnesisController],
  providers: [AnamnesisService],
  exports: [AnamnesisService],
})
export class AnamnesisModule {}
