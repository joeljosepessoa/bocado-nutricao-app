import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { StorageService } from './storage.service';

/**
 * Adapter padrão — disco local. É o que roda em dev/teste e continua
 * sendo o default em produção até `STORAGE_PROVIDER=s3` ser configurado
 * (ver S3StorageService e storage.module.ts).
 */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly baseDir: string;

  constructor(jwtService: JwtService, config: ConfigService) {
    super(jwtService, config);
    this.baseDir = resolve(this.config.get<string>('STORAGE_LOCAL_DIR') ?? '../storage');
  }

  async save(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sizeBytes: number }> {
    await mkdir(this.baseDir, { recursive: true });
    const extension = contentType.split('/')[1] ?? 'bin';
    const storageKey = `${randomUUID()}.${extension}`;
    await writeFile(join(this.baseDir, storageKey), buffer);
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    const path = join(this.baseDir, storageKey);
    if (!existsSync(path)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return readFile(path);
  }

  async delete(storageKey: string): Promise<void> {
    const path = join(this.baseDir, storageKey);
    if (existsSync(path)) {
      await unlink(path);
    }
  }
}
