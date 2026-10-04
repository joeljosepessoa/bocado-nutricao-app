import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  AliasEntry,
  buildManifest,
  buildMatchContext,
  buildReport,
  buildReviewCsv,
  decodeTextFile,
  parseBucketListing,
  parseInventoryCsv,
  PilotEntry,
} from './exercise-media-catalog';

/**
 * Gera o manifesto versionável dos GIFs do R2 + relatório de matching. Só LÊ
 * o inventário (CSV) e, opcionalmente, uma listagem do bucket; não acessa
 * banco, rede nem os GIFs. Não cria exercícios.
 *
 * Uso (a partir de backend/):
 *   EXERCISE_MEDIA_INVENTORY_CSV="<inventário .csv>" npm run reference-data:build-exercise-media-manifest
 *   ... -- --r2-listing <arquivo>   (saída de `aws s3 ls s3://<bucket>/exercises/ --recursive`;
 *                                    troca as chaves deduzidas pelas chaves reais do bucket)
 */

const DATA_DIR = join(__dirname, 'data');

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, fileName), 'utf-8')) as T;
}

function main() {
  const inventoryPath = process.env.EXERCISE_MEDIA_INVENTORY_CSV;
  if (!inventoryPath) {
    throw new Error('Defina EXERCISE_MEDIA_INVENTORY_CSV com o caminho do inventário dos GIFs (.csv).');
  }
  const listingFlag = process.argv.indexOf('--r2-listing');
  const listingPath = listingFlag >= 0 ? process.argv[listingFlag + 1] : undefined;

  const rows = parseInventoryCsv(readFileSync(inventoryPath, 'utf-8'));
  const catalogNames = readJson<{ name: string }[]>('exercises.json').map((exercise) => exercise.name);
  const aliases = readJson<{ exercises: AliasEntry[] }>('exercise-media-aliases.json').exercises;
  const pilot = readJson<PilotEntry[]>('exercise-media-pilot.json');
  const context = buildMatchContext(aliases, pilot, catalogNames);
  const listing = listingPath ? parseBucketListing(decodeTextFile(readFileSync(listingPath))) : undefined;
  if (listing && listing.objects.length === 0) {
    throw new Error(`Listagem do bucket sem nenhuma chave exercises/...gif reconhecida: ${listingPath}`);
  }

  const manifest = buildManifest(rows, context, listing);
  const report = buildReport(manifest, catalogNames, listing);

  writeFileSync(join(DATA_DIR, 'exercise-media-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(DATA_DIR, 'exercise-media-match-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(DATA_DIR, 'exercise-media-review.csv'), buildReviewCsv(manifest));

  const { byStatus } = report;
  console.log(
    `Manifesto: ${report.totalGifs} GIFs — EXACT ${byStatus.EXACT}, MATCHED ${byStatus.MATCHED}, ` +
      `REVIEW ${byStatus.REVIEW}, UNMATCHED ${byStatus.UNMATCHED}. ` +
      `Exercícios com GIF: ${report.exercisesWithGif.length}/${report.catalogExercises}. ` +
      `Chaves: ${report.storageKeys.verifiedByListing} conferidas na listagem do bucket, ${report.storageKeys.derived} deduzidas.`,
  );
  if (report.r2Listing) {
    const r2 = report.r2Listing;
    console.log(
      `Listagem do R2: ${r2.objectsInBucket} objeto(s); ${r2.inventoryConfirmed} confirmados no inventário; ` +
        `ausentes ${r2.missingInBucket.length}, tamanho divergente ${r2.sizeMismatch.length}, ambíguos ${r2.ambiguousInBucket.length}, ` +
        `no bucket e fora do inventário ${r2.bucketObjectsNotInInventory.length}. ` +
        `Vínculos seguros confirmados: ${r2.safeLinks.confirmed}; rebaixados para REVIEW: ${r2.safeLinks.rejected.length}.`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
