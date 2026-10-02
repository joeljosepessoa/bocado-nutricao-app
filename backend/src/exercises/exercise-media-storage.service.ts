import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from '../storage/s3-client';

/**
 * Configuração EXCLUSIVA da mídia de exercício (bucket R2 privado) — nunca as
 * variáveis S3_* do storage global, que guarda fotos e PDFs.
 */
export const EXERCISE_MEDIA_ENV = {
  bucket: 'EXERCISE_MEDIA_S3_BUCKET',
  endpoint: 'EXERCISE_MEDIA_S3_ENDPOINT',
  region: 'EXERCISE_MEDIA_S3_REGION',
  accessKeyId: 'EXERCISE_MEDIA_S3_ACCESS_KEY_ID',
  secretAccessKey: 'EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY',
} as const;

const REQUIRED_ENV = [
  EXERCISE_MEDIA_ENV.bucket,
  EXERCISE_MEDIA_ENV.endpoint,
  EXERCISE_MEDIA_ENV.accessKeyId,
  EXERCISE_MEDIA_ENV.secretAccessKey,
] as const;

export type ExerciseMediaStorageConfig =
  | { status: 'disabled' }
  | { status: 'invalid'; problems: string[] }
  | { status: 'enabled'; bucket: string; endpoint: string; region: string; accessKeyId: string; secretAccessKey: string };

/**
 * Nenhuma variável definida = desativado (dev/testes: o GIF cai no
 * `Exercise.imageUrl`). Qualquer uma definida = todas as obrigatórias, com
 * endpoint HTTPS — configuração pela metade é erro, nunca "meio ligado".
 * Mensagens só citam NOMES de variáveis, nunca valores.
 */
export function readExerciseMediaStorageConfig(get: (key: string) => string | undefined): ExerciseMediaStorageConfig {
  const read = (key: string) => get(key)?.trim() || undefined;
  const anyDefined = Object.values(EXERCISE_MEDIA_ENV).some((key) => read(key) !== undefined);
  if (!anyDefined) {
    return { status: 'disabled' };
  }
  const problems = REQUIRED_ENV.filter((key) => read(key) === undefined).map((key) => `${key} ausente`);
  const endpoint = read(EXERCISE_MEDIA_ENV.endpoint);
  if (endpoint && !/^https:\/\/[^/\s]+\/?$/i.test(endpoint)) {
    problems.push(`${EXERCISE_MEDIA_ENV.endpoint} deve ser só a origem HTTPS do bucket (https://<ACCOUNT_ID>.r2.cloudflarestorage.com)`);
  }
  if (problems.length > 0) {
    return { status: 'invalid', problems };
  }
  return {
    status: 'enabled',
    bucket: read(EXERCISE_MEDIA_ENV.bucket)!,
    endpoint: endpoint!.replace(/\/+$/, ''),
    region: read(EXERCISE_MEDIA_ENV.region) ?? 'auto',
    accessKeyId: read(EXERCISE_MEDIA_ENV.accessKeyId)!,
    secretAccessKey: read(EXERCISE_MEDIA_ENV.secretAccessKey)!,
  };
}

/**
 * Validade da URL temporária: a assinatura é feita no início da hora cheia
 * (mesma URL durante a hora inteira — o navegador e o app reaproveitam o
 * cache) e vale 3h a partir dali, então quem recebe a URL tem sempre entre
 * 2h e 3h de validade.
 */
export const EXERCISE_MEDIA_SIGNING_WINDOW_SECONDS = 60 * 60;
export const EXERCISE_MEDIA_URL_EXPIRES_IN_SECONDS = 3 * 60 * 60;

/** Parâmetros de qualquer URL pré-assinada S3/R2 (SigV4). */
const PRESIGNED_QUERY_PARAMS = ['x-amz-signature', 'x-amz-credential', 'x-amz-algorithm'];
const R2_HOST_SUFFIXES = ['.r2.cloudflarestorage.com', '.r2.dev'];

export function isPresignedUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const params = [...new URL(value).searchParams.keys()].map((key) => key.toLowerCase());
    return params.some((key) => PRESIGNED_QUERY_PARAMS.includes(key));
  } catch {
    return false;
  }
}

/**
 * Replacer de JSON.stringify para o que vai ao BANCO (ex.: texto da proposta
 * no log de interação da IA): URL pré-assinada vira null — ela é efêmera e
 * não deve ser persistida. A resposta HTTP continua com a URL.
 */
export function withoutPresignedUrls(_key: string, value: unknown): unknown {
  return isPresignedUrl(value) ? null : value;
}

/** Mídia primária de um exercício: a imagem mais antiga (determinística com N mídias). */
export const PRIMARY_EXERCISE_MEDIA_QUERY = {
  where: { contentType: { startsWith: 'image/' } },
  select: { storageKey: true },
  orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  take: 1,
};

export interface ExerciseWithMedia {
  imageUrl: string | null;
  media?: Array<{ storageKey: string }>;
}

/**
 * Entrega dos GIFs do catálogo guardados no R2 privado: só o backend tem a
 * credencial e devolve, no campo `imageUrl` de sempre, uma URL pré-assinada
 * de curta duração. Nada aqui é gravado no banco.
 */
@Injectable()
export class ExerciseMediaStorage {
  private readonly logger = new Logger(ExerciseMediaStorage.name);
  private readonly target: { client: S3Client; bucket: string; host: string } | null;
  private cacheWindowStart = -1;
  private readonly urlCache = new Map<string, string>();

  constructor(config: ConfigService) {
    const settings = readExerciseMediaStorageConfig((key) => config.get<string>(key));
    if (settings.status === 'invalid') {
      // Falha no boot, como o S3StorageService — melhor que GIFs sumindo em silêncio.
      throw new Error(`Mídia de exercício (R2) com configuração incompleta: ${settings.problems.join('; ')}.`);
    }
    this.target =
      settings.status === 'enabled'
        ? {
            client: createS3Client(settings),
            bucket: settings.bucket,
            host: new URL(settings.endpoint).host.toLowerCase(),
          }
        : null;
  }

  get enabled(): boolean {
    return this.target !== null;
  }

  /** URL pré-assinada (GET) do objeto; null se o R2 não está configurado ou a assinatura falhar. */
  async presignedGetUrl(storageKey: string, now: Date = new Date()): Promise<string | null> {
    if (!this.target) return null;
    const windowMs = EXERCISE_MEDIA_SIGNING_WINDOW_SECONDS * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    if (windowStart !== this.cacheWindowStart) {
      this.urlCache.clear();
      this.cacheWindowStart = windowStart;
    }
    const cached = this.urlCache.get(storageKey);
    if (cached) return cached;

    try {
      const url = await getSignedUrl(this.target.client, new GetObjectCommand({ Bucket: this.target.bucket, Key: storageKey }), {
        expiresIn: EXERCISE_MEDIA_URL_EXPIRES_IN_SECONDS,
        signingDate: new Date(windowStart),
      });
      this.urlCache.set(storageKey, url);
      return url;
    } catch (error) {
      // Só o tipo do erro — nunca chave, bucket ou credencial.
      this.logger.error(`Falha ao gerar URL temporária de mídia de exercício (${error instanceof Error ? error.name : 'erro'}).`);
      return null;
    }
  }

  /**
   * `imageUrl` exibido ao usuário: mídia do R2 (URL temporária) → imageUrl
   * gravado (URL externa ou caminho legado `/exercise-media/<sha256>`) → null.
   */
  async resolveImageUrl(exercise: ExerciseWithMedia): Promise<string | null> {
    const storageKey = exercise.media?.[0]?.storageKey;
    if (storageKey) {
      const url = await this.presignedGetUrl(storageKey);
      if (url) return url;
    }
    return exercise.imageUrl ?? null;
  }

  /** Mesmo objeto, sem a relação `media` e com o `imageUrl` resolvido — o contrato público não muda. */
  async toDisplay<T extends ExerciseWithMedia>(exercise: T): Promise<Omit<T, 'media'>> {
    const { media, ...rest } = exercise;
    return { ...rest, imageUrl: await this.resolveImageUrl({ imageUrl: exercise.imageUrl, media }) } as Omit<T, 'media'>;
  }

  /**
   * Uma URL temporária (ou do próprio bucket) recebida pelo cliente nunca pode
   * virar `Exercise.imageUrl` — expiraria. URL externa comum continua aceita.
   */
  assertPersistableImageUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl) return;
    let host: string;
    try {
      host = new URL(imageUrl).host.toLowerCase();
    } catch {
      return; // formato já é validado pelo DTO (@IsUrl)
    }
    const isStorageHost = host === this.target?.host || R2_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
    if (isStorageHost || isPresignedUrl(imageUrl)) {
      throw new BadRequestException(
        'imageUrl não pode ser um link temporário do armazenamento de mídia — o GIF do catálogo é vinculado pelo sistema.',
      );
    }
  }
}
