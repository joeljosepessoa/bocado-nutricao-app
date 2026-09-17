import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * Replica exatamente a factory de storage.module.ts em vez de subir o
 * módulo Nest inteiro (que arrastaria AuthModule/JwtModule/ConfigModule) —
 * o que se quer comprovar é só a regra de seleção por STORAGE_PROVIDER.
 */
function selectStorage(jwtService: JwtService, config: ConfigService) {
  const provider = config.get<string>('STORAGE_PROVIDER') ?? 'local';
  return provider === 's3' ? new S3StorageService(jwtService, config) : new LocalStorageService(jwtService, config);
}

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const jwtServiceStub = {} as JwtService;

describe('Seleção de provider de storage', () => {
  it('sem STORAGE_PROVIDER definido, usa LocalStorageService (default de dev)', () => {
    const service = selectStorage(jwtServiceStub, configWith({}));
    expect(service).toBeInstanceOf(LocalStorageService);
  });

  it('STORAGE_PROVIDER=local usa LocalStorageService', () => {
    const service = selectStorage(jwtServiceStub, configWith({ STORAGE_PROVIDER: 'local' }));
    expect(service).toBeInstanceOf(LocalStorageService);
  });

  it('STORAGE_PROVIDER=s3 usa S3StorageService (com S3_BUCKET configurado)', () => {
    const service = selectStorage(jwtServiceStub, configWith({ STORAGE_PROVIDER: 's3', S3_BUCKET: 'meu-bucket' }));
    expect(service).toBeInstanceOf(S3StorageService);
  });

  it('STORAGE_PROVIDER=s3 sem S3_BUCKET falha de forma clara, não em silêncio', () => {
    expect(() => selectStorage(jwtServiceStub, configWith({ STORAGE_PROVIDER: 's3' }))).toThrow(/S3_BUCKET/);
  });
});
