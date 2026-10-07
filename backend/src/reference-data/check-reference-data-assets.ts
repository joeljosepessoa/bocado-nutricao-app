import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Os scripts de reference-data leem JSON de `join(__dirname, 'data')` — no
 * artefato de produção, `dist/reference-data/data/`. O `nest build` só copia
 * esses arquivos porque eles estão declarados em `assets` no nest-cli.json;
 * esta checagem roda no `postbuild` e FALHA O BUILD (inclusive o da imagem
 * Docker) se algum JSON de src/reference-data/data não chegou ao dist.
 */
export function missingReferenceDataAssets(sourceDataDir: string, builtDataDir: string): string[] {
  const expected = readdirSync(sourceDataDir).filter((file) => file.endsWith('.json'));
  if (expected.length === 0) {
    throw new Error(`Nenhum JSON de referência encontrado em ${sourceDataDir}.`);
  }
  return expected.filter((file) => !existsSync(join(builtDataDir, file)));
}

function main() {
  // Rodando de dist/reference-data/: os fontes estão em ../../src/reference-data/data.
  const sourceDataDir = join(__dirname, '..', '..', 'src', 'reference-data', 'data');
  const builtDataDir = join(__dirname, 'data');
  const missing = missingReferenceDataAssets(sourceDataDir, builtDataDir);
  // O catálogo de alimentos é lido da planilha oficial da TACO (asset .xlsx).
  if (!existsSync(join(__dirname, 'taco', 'source', 'Taco-4a-Edicao.xlsx'))) missing.push('taco/source/Taco-4a-Edicao.xlsx');
  if (missing.length > 0) {
    console.error(`Build sem os dados de referência em ${builtDataDir}: ${missing.join(', ')} (ver assets no nest-cli.json).`);
    process.exit(1);
  }
  console.log(`Dados de referência no build: ok (${builtDataDir}).`);
}

if (require.main === module) {
  main();
}
