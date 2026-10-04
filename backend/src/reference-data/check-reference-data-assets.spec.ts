import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { missingReferenceDataAssets } from './check-reference-data-assets';

const BACKEND_DIR = join(__dirname, '..', '..');
const DATA_DIR = join(__dirname, 'data');

describe('dados de referência no artefato de produção', () => {
  it('nest-cli.json declara os JSON de reference-data/data como assets do build (copiados para dist/reference-data/data)', () => {
    const nestCli = JSON.parse(readFileSync(join(BACKEND_DIR, 'nest-cli.json'), 'utf-8'));
    expect(nestCli.sourceRoot).toBe('src');
    expect(nestCli.compilerOptions?.assets).toEqual(expect.arrayContaining([expect.objectContaining({ include: 'reference-data/data/*.json' })]));
  });

  it('os arquivos que os imports leem são JSON diretamente em data/ (cobertos pelo glob, sem subpastas)', () => {
    const files = readdirSync(DATA_DIR);
    for (const required of ['foods.json', 'exercises.json', 'exercise-media-pilot.json', 'exercise-media-manifest.json', 'exercise-media-aliases.json']) {
      expect(files).toContain(required);
    }
  });

  it('o build roda a checagem no postbuild — sem os JSON no dist o build falha', () => {
    const pkg = JSON.parse(readFileSync(join(BACKEND_DIR, 'package.json'), 'utf-8'));
    expect(pkg.scripts.postbuild).toBe('node dist/reference-data/check-reference-data-assets.js');
  });

  describe('missingReferenceDataAssets', () => {
    let root: string;
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'ref-assets-'));
      mkdirSync(join(root, 'src'));
      mkdirSync(join(root, 'dist'));
      for (const file of ['foods.json', 'exercises.json']) writeFileSync(join(root, 'src', file), '[]');
      writeFileSync(join(root, 'src', 'review.csv'), 'x');
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('aponta cada JSON ausente no dist (o CSV não é exigido)', () => {
      writeFileSync(join(root, 'dist', 'exercises.json'), '[]');
      expect(missingReferenceDataAssets(join(root, 'src'), join(root, 'dist'))).toEqual(['foods.json']);
    });

    it('build completo não acusa nada', () => {
      for (const file of ['foods.json', 'exercises.json']) writeFileSync(join(root, 'dist', file), '[]');
      expect(missingReferenceDataAssets(join(root, 'src'), join(root, 'dist'))).toEqual([]);
    });

    it('pasta de origem sem JSON é erro (nunca passa em silêncio)', () => {
      expect(() => missingReferenceDataAssets(join(root, 'dist'), join(root, 'dist'))).toThrow(/Nenhum JSON/);
    });
  });
});
