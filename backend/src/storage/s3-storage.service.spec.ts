import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const jwtServiceStub = {} as JwtService;

describe('S3StorageService', () => {
  const send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it('recusa construir sem S3_BUCKET — falha no boot, não no primeiro upload', () => {
    expect(() => new S3StorageService(jwtServiceStub, configWith({}))).toThrow(/S3_BUCKET/);
  });

  it('usa virtual-hosted style (sem forcePathStyle) quando não há S3_ENDPOINT — compatível com AWS S3', () => {
    new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));
    const config = (S3Client as unknown as jest.Mock).mock.calls[0][0];
    expect(config.forcePathStyle).toBeUndefined();
    expect(config.region).toBe('us-east-1');
  });

  it('força path-style quando há S3_ENDPOINT — necessário para R2/MinIO', () => {
    new S3StorageService(
      jwtServiceStub,
      configWith({ S3_BUCKET: 'meu-bucket', S3_ENDPOINT: 'https://minio.local:9000', S3_REGION: 'auto' }),
    );
    const config = (S3Client as unknown as jest.Mock).mock.calls[0][0];
    expect(config.forcePathStyle).toBe(true);
    expect(config.endpoint).toBe('https://minio.local:9000');
    expect(config.region).toBe('auto');
  });

  it('sem S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY, não passa `credentials` — deixa o SDK usar a cadeia padrão (ex.: IAM role)', () => {
    new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));
    const config = (S3Client as unknown as jest.Mock).mock.calls[0][0];
    expect(config.credentials).toBeUndefined();
  });

  it('save envia PutObjectCommand com Bucket/ContentType corretos e chave aleatória', async () => {
    send.mockResolvedValueOnce({});
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));

    const result = await service.save(Buffer.from('conteudo'), 'image/png');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input.Bucket).toBe('meu-bucket');
    expect(command.input.ContentType).toBe('image/png');
    expect(result.storageKey).toMatch(/\.png$/);
    expect(result.sizeBytes).toBe(Buffer.from('conteudo').byteLength);
  });

  it('falha do provedor no save vira erro genérico — a mensagem do SDK (bucket/endpoint) fica só no log do servidor', async () => {
    send.mockRejectedValueOnce(new Error('AccessDenied: bucket interno-secreto em https://endpoint.interno'));
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'interno-secreto' }));

    const error = await service.save(Buffer.from('x'), 'image/png').catch((e: Error) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).not.toMatch(/interno|endpoint/);
  });

  it('a chave gerada é imprevisível (uuid), plana e sem caracteres de caminho', async () => {
    send.mockResolvedValue({});
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));
    const keys = await Promise.all(Array.from({ length: 20 }, () => service.save(Buffer.from('x'), 'application/pdf')));
    expect(new Set(keys.map((k) => k.storageKey)).size).toBe(20);
    for (const { storageKey } of keys) expect(storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it('nunca usa ACL pública nem gera URL pública: o objeto é gravado sem ACL (bucket privado)', async () => {
    send.mockResolvedValueOnce({});
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));
    await service.save(Buffer.from('x'), 'image/png');
    expect(send.mock.calls[0][0].input.ACL).toBeUndefined();
  });

  it('read concatena o corpo em chunks e retorna um Buffer', async () => {
    async function* chunks() {
      yield Buffer.from('ab');
      yield Buffer.from('cd');
    }
    send.mockResolvedValueOnce({ Body: chunks() });
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));

    const buffer = await service.read('arquivo.png');

    expect(buffer.toString()).toBe('abcd');
  });

  it('read mapeia NoSuchKey do S3 para NotFoundException do Nest', async () => {
    send.mockRejectedValueOnce(new NoSuchKey({ message: 'not found', $metadata: {} }));
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));

    await expect(service.read('inexistente.png')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete envia DeleteObjectCommand com o Bucket e a Key certos', async () => {
    send.mockResolvedValueOnce({});
    const service = new S3StorageService(jwtServiceStub, configWith({ S3_BUCKET: 'meu-bucket' }));

    await service.delete('arquivo.png');

    const command = send.mock.calls[0][0];
    expect(command.input.Bucket).toBe('meu-bucket');
    expect(command.input.Key).toBe('arquivo.png');
  });
});
