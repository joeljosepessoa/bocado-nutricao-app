import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createR2KeyVerifier } from './import-exercise-media';

// Nenhuma chamada real ao R2: o cliente S3 é sempre um dublê.
const ENV = {
  EXERCISE_MEDIA_S3_BUCKET: 'bucket-teste',
  EXERCISE_MEDIA_S3_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com',
  EXERCISE_MEDIA_S3_ACCESS_KEY_ID: 'id-teste',
  EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: 'segredo-teste-NUNCA-exposto',
};
const get = (env: Record<string, string>) => (key: string) => env[key];

describe('createR2KeyVerifier', () => {
  it('sem credenciais do R2 não inventa nada: devolve null (o importador só aceita chaves da listagem real)', () => {
    expect(createR2KeyVerifier(get({}))).toBeNull();
  });

  it('credenciais pela metade abortam, citando só o nome da variável', () => {
    expect(() => createR2KeyVerifier(get({ EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: ENV.EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY }))).toThrow(
      /EXERCISE_MEDIA_S3_BUCKET ausente/,
    );
    try {
      createR2KeyVerifier(get({ EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: ENV.EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY }));
    } catch (error) {
      expect((error as Error).message).not.toContain('segredo-teste');
    }
  });

  it('confere a chave com HEAD no bucket configurado: ok, tamanho divergente ou ausente', async () => {
    const send = jest.fn();
    const verifier = createR2KeyVerifier(get(ENV), { send } as never)!;

    send.mockResolvedValueOnce({ ContentLength: 100 });
    await expect(verifier.check('exercises/barras/perna/a.gif', 100)).resolves.toBe('ok');
    const command = send.mock.calls[0][0] as HeadObjectCommand;
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({ Bucket: 'bucket-teste', Key: 'exercises/barras/perna/a.gif' });

    send.mockResolvedValueOnce({ ContentLength: 99 });
    await expect(verifier.check('exercises/barras/perna/a.gif', 100)).resolves.toBe('size-mismatch');

    send.mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
    await expect(verifier.check('exercises/barras/perna/b.gif', 100)).resolves.toBe('missing');
  });

  it('erro de credencial/rede aborta a importação (não segue sem conferir) e não vaza o segredo', async () => {
    const send = jest.fn().mockRejectedValueOnce(Object.assign(new Error(`assinatura com ${ENV.EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY} recusada`), { name: 'Forbidden', $metadata: { httpStatusCode: 403 } }));
    const verifier = createR2KeyVerifier(get(ENV), { send } as never)!;
    const failure = verifier.check('exercises/barras/perna/a.gif', 100);
    await expect(failure).rejects.toThrow('Falha ao conferir chave no R2 (Forbidden).');
    await expect(verifier.check('x', 1).catch((e: Error) => e.message)).resolves.not.toContain('segredo');
  });
});
