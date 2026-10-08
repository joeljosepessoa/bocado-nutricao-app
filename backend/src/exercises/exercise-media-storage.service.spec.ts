import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ExerciseMediaCurationStatus } from '@prisma/client';
import {
  EXERCISE_MEDIA_URL_EXPIRES_IN_SECONDS,
  ExerciseMediaStorage,
  PRIMARY_EXERCISE_MEDIA_QUERY,
  isPresignedUrl,
  readExerciseMediaStorageConfig,
  withoutPresignedUrls,
} from './exercise-media-storage.service';

const APPROVED = ExerciseMediaCurationStatus.approved;
const PENDING = ExerciseMediaCurationStatus.pending;
const REJECTED = ExerciseMediaCurationStatus.rejected;

// Nenhuma chamada real ao R2: cliente S3 e presigner são simulados.
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

const SECRET = 'segredo-r2-de-teste-NUNCA-exposto';
const ACCESS_KEY = 'access-key-r2-de-teste';
const ENDPOINT = 'https://conta-teste.r2.cloudflarestorage.com';
const fullEnv = {
  EXERCISE_MEDIA_S3_BUCKET: 'bucket-teste',
  EXERCISE_MEDIA_S3_ENDPOINT: ENDPOINT,
  EXERCISE_MEDIA_S3_ACCESS_KEY_ID: ACCESS_KEY,
  EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: SECRET,
};

const configWith = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;
const signed = getSignedUrl as jest.Mock;
const fakeSignedUrl = (key: string) =>
  `${ENDPOINT}/bucket-teste/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x&X-Amz-Signature=abc`;

describe('readExerciseMediaStorageConfig', () => {
  it('nada definido = desativado (dev/testes)', () => {
    expect(readExerciseMediaStorageConfig(() => undefined)).toEqual({ status: 'disabled' });
  });

  it('tudo definido = ativo, região padrão "auto" e endpoint sem barra final', () => {
    const result = readExerciseMediaStorageConfig((key) => ({ ...fullEnv, EXERCISE_MEDIA_S3_ENDPOINT: `${ENDPOINT}/` })[key]);
    expect(result).toMatchObject({ status: 'enabled', bucket: 'bucket-teste', endpoint: ENDPOINT, region: 'auto' });
  });

  it.each([
    ['bucket ausente', 'EXERCISE_MEDIA_S3_BUCKET'],
    ['endpoint ausente', 'EXERCISE_MEDIA_S3_ENDPOINT'],
    ['access key ausente', 'EXERCISE_MEDIA_S3_ACCESS_KEY_ID'],
    ['secret ausente', 'EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY'],
  ])('%s = configuração inválida, citando só o NOME da variável', (_label, missing) => {
    const env: Record<string, string> = { ...fullEnv };
    delete env[missing];
    const result = readExerciseMediaStorageConfig((key) => env[key]);
    expect(result.status).toBe('invalid');
    const text = JSON.stringify(result);
    expect(text).toContain(missing);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(ACCESS_KEY);
  });

  it('endpoint precisa ser só a origem HTTPS', () => {
    for (const endpoint of ['http://conta.r2.cloudflarestorage.com', `${ENDPOINT}/bucket-teste`, 'conta.r2.cloudflarestorage.com']) {
      expect(readExerciseMediaStorageConfig((key) => ({ ...fullEnv, EXERCISE_MEDIA_S3_ENDPOINT: endpoint })[key]).status).toBe('invalid');
    }
  });
});

describe('ExerciseMediaStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({}));
    signed.mockImplementation(async (_client, command: GetObjectCommand) => fakeSignedUrl(command.input.Key!));
  });

  it('configuração pela metade impede o boot, sem vazar a credencial na mensagem', () => {
    const build = () => new ExerciseMediaStorage(configWith({ EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: SECRET }));
    expect(build).toThrow(/EXERCISE_MEDIA_S3_BUCKET/);
    try {
      build();
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
    }
  });

  it('cliente S3 do R2 usa só as variáveis EXERCISE_MEDIA_S3_* (nunca as S3_* globais)', () => {
    new ExerciseMediaStorage(configWith({ ...fullEnv, S3_ENDPOINT: 'https://global.example', S3_ACCESS_KEY_ID: 'global' }));
    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET },
    });
  });

  it('desativado: não assina nada e o imageUrl gravado é o resultado', async () => {
    const storage = new ExerciseMediaStorage(configWith({}));
    expect(storage.enabled).toBe(false);
    await expect(storage.presignedGetUrl('exercises/halteres/a.gif')).resolves.toBeNull();
    await expect(storage.resolveImageUrl({ imageUrl: null, media: [{ storageKey: 'exercises/halteres/a.gif', curationStatus: APPROVED }] })).resolves.toBeNull();
    await expect(storage.resolveImageUrl({ imageUrl: 'https://cdn.exemplo.com/x.gif', media: [{ storageKey: 'k', curationStatus: APPROVED }] })).resolves.toBe(
      'https://cdn.exemplo.com/x.gif',
    );
    expect(S3Client).not.toHaveBeenCalled();
    expect(signed).not.toHaveBeenCalled();
  });

  it('gera GET pré-assinado do objeto certo, assinado na hora cheia e válido por 3h (2h a 3h para quem recebe)', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const now = new Date('2026-10-02T14:37:12Z');

    const url = await storage.presignedGetUrl('exercises/halteres/rosca.gif', now);

    expect(url).toBe(fakeSignedUrl('exercises/halteres/rosca.gif'));
    const [, command, options] = signed.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'bucket-teste', Key: 'exercises/halteres/rosca.gif' });
    expect(options).toEqual({ expiresIn: EXERCISE_MEDIA_URL_EXPIRES_IN_SECONDS, signingDate: new Date('2026-10-02T14:00:00Z') });
    expect(EXERCISE_MEDIA_URL_EXPIRES_IN_SECONDS).toBe(3 * 60 * 60);
  });

  it('mesma URL dentro da hora (cache), nova assinatura na hora seguinte', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    await storage.presignedGetUrl('k.gif', new Date('2026-10-02T14:01:00Z'));
    await storage.presignedGetUrl('k.gif', new Date('2026-10-02T14:59:00Z'));
    expect(signed).toHaveBeenCalledTimes(1);

    await storage.presignedGetUrl('k.gif', new Date('2026-10-02T15:00:00Z'));
    expect(signed).toHaveBeenCalledTimes(2);
    expect(signed.mock.calls[1][2].signingDate).toEqual(new Date('2026-10-02T15:00:00Z'));
  });

  it('resolveImageUrl: R2 > imageUrl externo > caminho legado /exercise-media/<sha256> > null', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const legacy = `/exercise-media/${'a'.repeat(64)}`;

    await expect(storage.resolveImageUrl({ imageUrl: legacy, media: [{ storageKey: 'exercises/barras/supino.gif', curationStatus: APPROVED }] })).resolves.toBe(
      fakeSignedUrl('exercises/barras/supino.gif'),
    );
    await expect(storage.resolveImageUrl({ imageUrl: 'https://cdn.exemplo.com/x.gif', media: [] })).resolves.toBe('https://cdn.exemplo.com/x.gif');
    await expect(storage.resolveImageUrl({ imageUrl: legacy })).resolves.toBe(legacy);
    await expect(storage.resolveImageUrl({ imageUrl: null, media: [] })).resolves.toBeNull();
  });

  it('múltiplas mídias: usa a primeira APROVADA na ordem da consulta (principal primeiro)', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const url = await storage.resolveImageUrl({
      imageUrl: null,
      media: [
        { storageKey: 'rejeitada.gif', curationStatus: REJECTED },
        { storageKey: 'pendente.gif', curationStatus: PENDING },
        { storageKey: 'aprovada.gif', curationStatus: APPROVED },
        { storageKey: 'aprovada-2.gif', curationStatus: APPROVED },
      ],
    });
    expect(url).toBe(fakeSignedUrl('aprovada.gif'));
    expect(signed).toHaveBeenCalledTimes(1);
  });

  it('GIFs só pendentes/rejeitados: nada é exibido — nem o imageUrl antigo (pode ser o GIF rejeitado)', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const legacy = `/exercise-media/${'a'.repeat(64)}`;
    await expect(
      storage.resolveImageUrl({ imageUrl: legacy, media: [{ storageKey: 'r.gif', curationStatus: REJECTED }, { storageKey: 'p.gif', curationStatus: PENDING }] }),
    ).resolves.toBeNull();
    expect(signed).not.toHaveBeenCalled();
  });

  it('consulta: todas as imagens, principal primeiro, depois sortOrder, data e id', () => {
    expect(PRIMARY_EXERCISE_MEDIA_QUERY.orderBy).toEqual([{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    expect(PRIMARY_EXERCISE_MEDIA_QUERY.select).toEqual({ storageKey: true, curationStatus: true });
    expect(PRIMARY_EXERCISE_MEDIA_QUERY.where).toEqual({ contentType: { startsWith: 'image/' } });
  });

  it('falha ao assinar: cai no imageUrl gravado e o log não leva credencial', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const logError = jest.spyOn((storage as unknown as { logger: { error: (m: string) => void } }).logger, 'error').mockImplementation(() => undefined);
    signed.mockRejectedValueOnce(new Error(`credencial ${SECRET} recusada`));

    await expect(storage.resolveImageUrl({ imageUrl: 'https://cdn.exemplo.com/x.gif', media: [{ storageKey: 'k.gif', curationStatus: APPROVED }] })).resolves.toBe(
      'https://cdn.exemplo.com/x.gif',
    );
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).not.toContain(SECRET);
  });

  it('toDisplay: remove a relação media e mantém o resto do objeto intacto', async () => {
    const storage = new ExerciseMediaStorage(configWith(fullEnv));
    const display = await storage.toDisplay({ id: 'e1', name: 'Supino', imageUrl: null, media: [{ storageKey: 'k.gif', curationStatus: APPROVED }] });
    expect(display).toEqual({ id: 'e1', name: 'Supino', imageUrl: fakeSignedUrl('k.gif') });
    expect(JSON.stringify(display)).not.toContain(SECRET);
    expect(JSON.stringify(display)).not.toContain(ACCESS_KEY);
  });

  describe('assertPersistableImageUrl — URL temporária nunca vira Exercise.imageUrl', () => {
    const storage = () => new ExerciseMediaStorage(configWith(fullEnv));

    it.each([
      ['URL pré-assinada recebida da API', fakeSignedUrl('exercises/halteres/a.gif')],
      ['host do bucket configurado, mesmo sem assinatura', `${ENDPOINT}/bucket-teste/a.gif`],
      ['qualquer endpoint S3 do R2', 'https://outra-conta.r2.cloudflarestorage.com/b/a.gif'],
      ['r2.dev público', 'https://pub-123.r2.dev/a.gif'],
      ['pré-assinada de outro provedor S3', 'https://s3.amazonaws.com/b/a.gif?x-amz-signature=1&X-Amz-Credential=2'],
    ])('rejeita %s', (_label, url) => {
      expect(() => storage().assertPersistableImageUrl(url)).toThrow(BadRequestException);
    });

    it('aceita URL externa comum, vazio e ausente', () => {
      expect(() => storage().assertPersistableImageUrl('https://cdn.exemplo.com/supino.gif?v=2')).not.toThrow();
      expect(() => storage().assertPersistableImageUrl(undefined)).not.toThrow();
      expect(() => storage().assertPersistableImageUrl(null)).not.toThrow();
    });

    it('também protege com o R2 desativado', () => {
      expect(() => new ExerciseMediaStorage(configWith({})).assertPersistableImageUrl(fakeSignedUrl('a.gif'))).toThrow(BadRequestException);
    });
  });
});

describe('withoutPresignedUrls / isPresignedUrl', () => {
  it('ao serializar para o banco, URL pré-assinada vira null e o resto fica igual', () => {
    const payload = { a: { imageUrl: fakeSignedUrl('k.gif'), name: 'Supino' }, b: { imageUrl: 'https://cdn.exemplo.com/x.gif' }, c: { imageUrl: null } };
    expect(JSON.parse(JSON.stringify(payload, withoutPresignedUrls))).toEqual({
      a: { imageUrl: null, name: 'Supino' },
      b: { imageUrl: 'https://cdn.exemplo.com/x.gif' },
      c: { imageUrl: null },
    });
  });

  it('detecta só URLs com parâmetros de assinatura SigV4', () => {
    expect(isPresignedUrl(fakeSignedUrl('k'))).toBe(true);
    expect(isPresignedUrl('https://cdn.exemplo.com/x.gif?v=1')).toBe(false);
    expect(isPresignedUrl('/exercise-media/abc')).toBe(false);
    expect(isPresignedUrl(42)).toBe(false);
  });
});
