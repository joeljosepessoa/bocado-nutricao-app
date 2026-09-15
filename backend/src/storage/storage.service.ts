import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

const SIGNED_URL_TTL_SECONDS = 300;

@Injectable()
export class StorageService {
  private readonly baseDir: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
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

  getSignedUrl(storageKey: string, contentType: string): SignedUrl {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000);
    const token = this.jwtService.sign(
      { storageKey, contentType, purpose: 'photo-download' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: SIGNED_URL_TTL_SECONDS,
      },
    );
    return { url: `/files/${token}`, expiresAt };
  }

  verifySignedToken(token: string): { storageKey: string; contentType: string } {
    const payload = this.jwtService.verify<{ storageKey: string; contentType: string; purpose: string }>(
      token,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET') },
    );
    if (payload.purpose !== 'photo-download') {
      throw new NotFoundException('Token inválido.');
    }
    return payload;
  }
}
