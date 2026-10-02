import { S3Client } from '@aws-sdk/client-s3';

/** Conexão com um bucket compatível com S3 (AWS S3, Cloudflare R2, MinIO…). */
export interface S3ConnectionSettings {
  region: string;
  /** Vazio = AWS S3. Com endpoint próprio (R2, MinIO) usa path-style. */
  endpoint?: string;
  /** As duas vazias = cadeia padrão de credenciais do SDK (ex.: IAM role). */
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Único lugar que monta o S3Client — usado pelo storage global
 * (S3StorageService: fotos/PDFs) e pela mídia de exercício (bucket próprio),
 * cada um com a SUA configuração.
 */
export function createS3Client({ region, endpoint, accessKeyId, secretAccessKey }: S3ConnectionSettings): S3Client {
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}
