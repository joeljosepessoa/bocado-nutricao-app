import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { FilesController } from './files.controller';

export function createStorageService(jwtService: JwtService, config: ConfigService): StorageService {
  const provider = config.get<string>('STORAGE_PROVIDER') ?? 'local';
  // Valor desconhecido (ex.: "S3", "s3 ") falha no boot: cair em silêncio para o disco local
  // em produção seria perder arquivos sem ninguém perceber.
  if (provider !== 'local' && provider !== 's3') {
    throw new Error(`STORAGE_PROVIDER inválido: "${provider}". Use "local" ou "s3".`);
  }
  return provider === 's3' ? new S3StorageService(jwtService, config) : new LocalStorageService(jwtService, config);
}

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    {
      provide: StorageService,
      useFactory: createStorageService,
      inject: [JwtService, ConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
