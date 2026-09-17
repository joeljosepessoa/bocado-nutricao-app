import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { StorageService } from './storage.service';

/**
 * Adapter de object storage compatível com S3 — protocolo público e
 * padrão da indústria, suportado tal como está por AWS S3, Cloudflare R2,
 * Backblaze B2, MinIO etc. (basta trocar `S3_ENDPOINT`/`S3_REGION`). Não
 * há nenhuma credencial real aqui: fica inerte até `STORAGE_PROVIDER=s3`
 * e as variáveis `S3_*` serem configuradas com uma conta real — decisão
 * de negócio/infra do usuário, não algo que o código possa inventar.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(jwtService: JwtService, config: ConfigService) {
    super(jwtService, config);
    this.bucket = this.config.get<string>('S3_BUCKET') ?? '';
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async save(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sizeBytes: number }> {
    const extension = contentType.split('/')[1] ?? 'bin';
    const storageKey = `${randomUUID()}.${extension}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Falha ao salvar arquivo no object storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      const body = result.Body;
      if (!body) {
        throw new NotFoundException('Arquivo não encontrado.');
      }
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof NoSuchKey) {
        throw new NotFoundException('Arquivo não encontrado.');
      }
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}
