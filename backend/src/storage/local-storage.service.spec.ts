import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageService } from './local-storage.service';
import { buildStorageKey } from './storage.service';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('LocalStorageService', () => {
  let root: string;
  let dir: string;
  let service: LocalStorageService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bocado-storage-'));
    dir = join(root, 'volume');
    service = new LocalStorageService({} as JwtService, configWith({ STORAGE_LOCAL_DIR: dir }));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('cria o diretório e confere que é gravável no boot (sem deixar arquivo de teste)', () => {
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('falha no boot com mensagem clara se o caminho não é um diretório gravável', () => {
    const file = join(root, 'e-um-arquivo');
    writeFileSync(file, 'x');
    expect(() => new LocalStorageService({} as JwtService, configWith({ STORAGE_LOCAL_DIR: join(file, 'sub') }))).toThrow(
      /não é gravável/,
    );
  });

  it('save -> read -> delete: ida e volta idêntica, chave = uuid + extensão do tipo', async () => {
    const data = Buffer.from([0, 1, 2, 255, 254, 65, 66]);
    const { storageKey, sizeBytes } = await service.save(data, 'application/pdf');

    expect(storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(sizeBytes).toBe(data.byteLength);
    expect(Buffer.compare(await service.read(storageKey), data)).toBe(0);

    await service.delete(storageKey);
    await expect(service.read(storageKey)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(storageKey)).resolves.toBeUndefined(); // idempotente
  });

  it('escrita atômica: depois do save só existe o arquivo final (nada de .tmp) e o conteúdo é completo', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 7);
    const { storageKey } = await service.save(big, 'image/jpeg');
    expect(readdirSync(dir)).toEqual([storageKey]);
    expect(readFileSync(join(dir, storageKey)).byteLength).toBe(big.byteLength);
  });

  it('sobrevive a "reinício": um novo adapter apontando para o mesmo diretório lê o que o anterior gravou', async () => {
    const { storageKey } = await service.save(Buffer.from('persistente'), 'image/png');
    const restarted = new LocalStorageService({} as JwtService, configWith({ STORAGE_LOCAL_DIR: dir }));
    expect((await restarted.read(storageKey)).toString()).toBe('persistente');
  });

  it('lê a subpasta exercise-media/ (GIFs do piloto: exercise-media/<sha256>.gif)', async () => {
    mkdirSync(join(dir, 'exercise-media'));
    const key = `exercise-media/${'a'.repeat(64)}.gif`;
    writeFileSync(join(dir, key), 'GIF89a');
    expect((await service.read(key)).toString()).toBe('GIF89a');
  });

  it('chaves que escapam do diretório (../, absoluta, byte nulo, vazia, ".") são NotFound e não leem nem apagam nada de fora', async () => {
    const secret = join(root, 'segredo.txt');
    writeFileSync(secret, 'FORA-DO-STORAGE');

    for (const key of ['../segredo.txt', 'a/../../segredo.txt', secret, 'ok\0.txt', '', '.', '..']) {
      await expect(service.read(key)).rejects.toBeInstanceOf(NotFoundException);
    }
    // "..\x" só é separador no Windows; no POSIX é um nome de arquivo comum — em ambos não pode devolver o segredo.
    const backslash = await service.read('..\\segredo.txt').then(
      (buffer) => buffer.toString(),
      () => 'rejeitado',
    );
    expect(backslash).not.toContain('FORA-DO-STORAGE');

    await service.delete('../segredo.txt').catch(() => undefined);
    await service.delete(secret).catch(() => undefined);
    expect(existsSync(secret)).toBe(true);
  });

  it('save sanitiza a extensão (tipo de conteúdo hostil não vira separador de caminho)', async () => {
    const { storageKey } = await service.save(Buffer.from('x'), 'image/../../etc/passwd');
    expect(storageKey).toMatch(/^[0-9a-f-]{36}\.[a-z0-9]+$/);
    expect(existsSync(join(dir, storageKey))).toBe(true);
  });
});

describe('buildStorageKey', () => {
  it('é imprevisível (uuid v4) e só usa [a-z0-9] na extensão', () => {
    const keys = new Set(Array.from({ length: 200 }, () => buildStorageKey('image/jpeg')));
    expect(keys.size).toBe(200);
    expect(buildStorageKey('image/svg+xml')).toMatch(/\.svgxml$/);
    expect(buildStorageKey('')).toMatch(/\.bin$/);
    expect(buildStorageKey('semBarra')).toMatch(/\.bin$/);
  });
});
