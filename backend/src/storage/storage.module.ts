import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from './storage.service';
import { FilesController } from './files.controller';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
