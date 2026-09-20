import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve } from 'path';
import { buildStorageKey, StorageService } from './storage.service';

/**
 * Adapter padrão — disco local. É o que roda em dev/teste e o caminho da
 * primeira implantação em produção: `STORAGE_LOCAL_DIR` DEVE apontar para um
 * volume persistente (o docker-compose monta `bocado-storage` em
 * `/data/storage`). Sem volume, fotos/PDFs/GIFs somem a cada recriação do
 * container. Trocar para S3 exige só `STORAGE_PROVIDER=s3` (ver
 * S3StorageService e storage.module.ts).
 */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly baseDir: string;

  constructor(jwtService: JwtService, config: ConfigService) {
    super(jwtService, config);
    this.baseDir = resolve(this.config.get<string>('STORAGE_LOCAL_DIR') ?? '../storage');
    this.assertWritable();
  }

  /** Falha no boot (não no primeiro upload) se o volume não existe, é somente-leitura ou sem permissão. */
  private assertWritable(): void {
    const probe = join(this.baseDir, `.write-check-${randomUUID()}`);
    try {
      mkdirSync(this.baseDir, { recursive: true });
      writeFileSync(probe, 'ok');
      unlinkSync(probe);
    } catch (error) {
      throw new Error(
        `STORAGE_LOCAL_DIR (${this.baseDir}) não é gravável: ${error instanceof Error ? error.message : String(error)}. ` +
          'Em Docker, monte um volume persistente nesse caminho.',
      );
    }
  }

  /**
   * Toda leitura/remoção passa por aqui: a chave resolvida tem que ficar
   * DENTRO de baseDir. As chaves vêm do banco ou de um token assinado por nós,
   * mas isto é defesa em profundidade — uma chave `../..` ou absoluta nunca
   * pode sair do diretório de storage.
   */
  private resolveKey(storageKey: string): string {
    if (typeof storageKey !== 'string' || storageKey.length === 0 || storageKey.includes('\0')) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const full = resolve(this.baseDir, storageKey);
    const rel = relative(this.baseDir, full);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return full;
  }

  async save(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sizeBytes: number }> {
    const storageKey = buildStorageKey(contentType);
    const finalPath = join(this.baseDir, storageKey);
    const tempPath = join(this.baseDir, `.tmp-${randomUUID()}`);
    await mkdir(this.baseDir, { recursive: true });
    // Escrita atômica: o arquivo só aparece na chave final quando está completo — um
    // backup ou uma leitura concorrente nunca vê um arquivo pela metade.
    try {
      await writeFile(tempPath, buffer);
      await rename(tempPath, finalPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    const path = this.resolveKey(storageKey);
    if (!existsSync(path)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return readFile(path);
  }

  async delete(storageKey: string): Promise<void> {
    const path = this.resolveKey(storageKey);
    if (existsSync(path)) {
      await unlink(path);
    }
  }
}
