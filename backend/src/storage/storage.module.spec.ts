import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { createStorageService } from './storage.module';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const jwtServiceStub = {} as JwtService;

describe('Seleção de provider de storage (a factory real do StorageModule)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bocado-module-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sem STORAGE_PROVIDER definido, usa LocalStorageService (default de dev)', () => {
    const service = createStorageService(jwtServiceStub, configWith({ STORAGE_LOCAL_DIR: dir }));
    expect(service).toBeInstanceOf(LocalStorageService);
  });

  it('STORAGE_PROVIDER=local usa LocalStorageService', () => {
    const service = createStorageService(jwtServiceStub, configWith({ STORAGE_PROVIDER: 'local', STORAGE_LOCAL_DIR: dir }));
    expect(service).toBeInstanceOf(LocalStorageService);
  });

  it('STORAGE_PROVIDER=s3 usa S3StorageService (com S3_BUCKET configurado)', () => {
    const service = createStorageService(jwtServiceStub, configWith({ STORAGE_PROVIDER: 's3', S3_BUCKET: 'meu-bucket' }));
    expect(service).toBeInstanceOf(S3StorageService);
  });

  it('STORAGE_PROVIDER=s3 sem S3_BUCKET falha de forma clara, não em silêncio', () => {
    expect(() => createStorageService(jwtServiceStub, configWith({ STORAGE_PROVIDER: 's3' }))).toThrow(/S3_BUCKET/);
  });

  it('provider desconhecido ("S3", "s3 ", "gcs") falha no boot em vez de cair no disco local', () => {
    for (const provider of ['S3', 's3 ', 'gcs', 'disk']) {
      expect(() => createStorageService(jwtServiceStub, configWith({ STORAGE_PROVIDER: provider, STORAGE_LOCAL_DIR: dir }))).toThrow(
        /STORAGE_PROVIDER inválido/,
      );
    }
  });
});
