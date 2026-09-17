import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { FilesController } from './files.controller';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    {
      provide: StorageService,
      useFactory: (jwtService: JwtService, config: ConfigService) => {
        const provider = config.get<string>('STORAGE_PROVIDER') ?? 'local';
        return provider === 's3'
          ? new S3StorageService(jwtService, config)
          : new LocalStorageService(jwtService, config);
      },
      inject: [JwtService, ConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
