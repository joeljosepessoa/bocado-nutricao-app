import { readFileSync } from 'fs';
import { join } from 'path';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ExerciseScope, PrismaClient } from '@prisma/client';
import { readExerciseMediaStorageConfig } from '../exercises/exercise-media-storage.service';
import { createS3Client } from '../storage/s3-client';
import { ManifestEntry, validateManifest } from './exercise-media-catalog';
import { SYSTEM_PROFESSIONAL_EMAIL } from './import-reference-data';

/**
 * Vincula os GIFs do manifesto (já no R2) aos exercícios do catálogo do
 * sistema, criando ExerciseMedia — SÓ para EXACT/MATCHED. Não envia nem
 * baixa GIF, não cria nem altera Exercise, não grava URL (só a chave).
 *
 * Idempotente: chave já vinculada ao mesmo exercício é ignorada; chave
 * vinculada a OUTRO exercício é conflito (nunca move). Toda chave é
 * conferida antes de gravar: HEAD no R2 (EXERCISE_MEDIA_S3_*) ou, sem
 * credencial, só as chaves vindas de uma listagem real do bucket.
 *
 * Uso (a partir de backend/):
 *   npm run reference-data:import-exercise-media -- --dry-run   (só relata)
 *   npm run reference-data:import-exercise-media
 */

export type KeyCheck = 'ok' | 'missing' | 'size-mismatch';

export interface StorageKeyVerifier {
  check(storageKey: string, sizeBytes: number): Promise<KeyCheck>;
}

/** HEAD no bucket de mídia de exercício. null quando EXERCISE_MEDIA_S3_* não está configurado. */
export function createR2KeyVerifier(get: (key: string) => string | undefined, client?: Pick<S3Client, 'send'>): StorageKeyVerifier | null {
  const settings = readExerciseMediaStorageConfig(get);
  if (settings.status === 'invalid') {
    throw new Error(`Mídia de exercício (R2) com configuração incompleta: ${settings.problems.join('; ')}.`);
  }
  if (settings.status === 'disabled') {
    return null;
  }
  const s3 = client ?? createS3Client(settings);
  return {
    async check(storageKey, sizeBytes) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: settings.bucket, Key: storageKey }));
        return head.ContentLength === undefined || head.ContentLength === sizeBytes ? 'ok' : 'size-mismatch';
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string }) ?? {};
        if (status.$metadata?.httpStatusCode === 404 || status.name === 'NotFound' || status.name === 'NoSuchKey') {
          return 'missing';
        }
        // Credencial errada, rede etc.: aborta em vez de seguir sem conferir.
        throw new Error(`Falha ao conferir chave no R2 (${status.name ?? 'erro'}).`);
      }
    },
  };
}

export type SkipReason =
  | 'already-imported'
  | 'exercise-not-found'
  | 'exercise-ambiguous'
  | 'key-linked-to-other-exercise'
  | 'duplicate-content-same-exercise'
  | 'key-unverified'
  | 'key-missing-in-bucket'
  | 'key-size-mismatch';

export interface ImportExerciseMediaSummary {
  dryRun: boolean;
  verification: 'r2-head' | 'listing-only';
  safeEntries: number;
  created: number;
  /** Vínculos removidos por estarem recusados na revisão humana (só a linha; o arquivo no R2 fica). */
  removedRejected: number;
  skipped: Record<SkipReason, number>;
  problems: string[];
}

export async function importExerciseMedia(
  prisma: PrismaClient,
  manifest: ManifestEntry[],
  options: { verifier: StorageKeyVerifier | null; dryRun: boolean },
): Promise<ImportExerciseMediaSummary> {
  const safe = manifest.filter((entry) => (entry.matchStatus === 'EXACT' || entry.matchStatus === 'MATCHED') && entry.exerciseName);
  const summary: ImportExerciseMediaSummary = {
    dryRun: options.dryRun,
    verification: options.verifier ? 'r2-head' : 'listing-only',
    safeEntries: safe.length,
    created: 0,
    removedRejected: 0,
    skipped: {
      'already-imported': 0,
      'exercise-not-found': 0,
      'exercise-ambiguous': 0,
      'key-linked-to-other-exercise': 0,
      'duplicate-content-same-exercise': 0,
      'key-unverified': 0,
      'key-missing-in-bucket': 0,
      'key-size-mismatch': 0,
    },
    problems: [],
  };
  const skip = (reason: SkipReason, detail?: string) => {
    summary.skipped[reason] += 1;
    if (detail) summary.problems.push(detail);
  };

  const system = await prisma.user.findUnique({ where: { email: SYSTEM_PROFESSIONAL_EMAIL } });
  if (!system) {
    throw new Error('Catálogo do sistema não encontrado — rode "npm run reference-data:import" antes.');
  }

  // Só o catálogo do sistema — nunca exercícios de profissionais com o mesmo nome.
  const names = [...new Set(safe.map((entry) => entry.exerciseName!))];
  const exercises = await prisma.exercise.findMany({
    where: { name: { in: names }, scope: ExerciseScope.global, createdByProfessionalId: system.id },
    select: { id: true, name: true },
  });
  const idsByName = new Map<string, string[]>();
  for (const exercise of exercises) idsByName.set(exercise.name, [...(idsByName.get(exercise.name) ?? []), exercise.id]);

  // Estado já gravado (e o que este próprio lote vai gravar), para idempotência e dedupe.
  const existing = await prisma.exerciseMedia.findMany({
    where: { OR: [{ storageKey: { in: safe.map((entry) => entry.storageKey) } }, { exerciseId: { in: exercises.map((e) => e.id) } }] },
    select: { exerciseId: true, storageKey: true, sha256: true },
  });
  const exerciseByKey = new Map(existing.map((media) => [media.storageKey, media.exerciseId]));
  const shaByExercise = new Set(existing.map((media) => `${media.exerciseId}:${media.sha256}`));

  for (const entry of safe) {
    const ids = idsByName.get(entry.exerciseName!) ?? [];
    if (ids.length === 0) {
      skip('exercise-not-found', `${entry.exerciseName}: exercício não existe no catálogo do sistema (${entry.fileName}).`);
      continue;
    }
    if (ids.length > 1) {
      skip('exercise-ambiguous', `${entry.exerciseName}: mais de um exercício do sistema com esse nome.`);
      continue;
    }
    const exerciseId = ids[0];

    const linkedTo = exerciseByKey.get(entry.storageKey);
    if (linkedTo === exerciseId) {
      skip('already-imported');
      continue;
    }
    if (linkedTo) {
      skip('key-linked-to-other-exercise', `${entry.storageKey}: já vinculada a outro exercício — não foi movida.`);
      continue;
    }
    if (shaByExercise.has(`${exerciseId}:${entry.sha256}`)) {
      skip('duplicate-content-same-exercise');
      continue;
    }

    if (options.verifier) {
      const check = await options.verifier.check(entry.storageKey, entry.sizeBytes);
      if (check === 'missing') {
        skip('key-missing-in-bucket', `${entry.storageKey}: não existe no bucket.`);
        continue;
      }
      if (check === 'size-mismatch') {
        skip('key-size-mismatch', `${entry.storageKey}: tamanho no bucket difere do inventário.`);
        continue;
      }
    } else if (entry.storageKeySource !== 'r2-listing') {
      skip('key-unverified');
      continue;
    }

    if (!options.dryRun) {
      await prisma.exerciseMedia.create({
        data: {
          exerciseId,
          storageKey: entry.storageKey,
          contentType: entry.contentType,
          sizeBytes: entry.sizeBytes,
          sha256: entry.sha256,
        },
      });
    }
    exerciseByKey.set(entry.storageKey, exerciseId);
    shaByExercise.add(`${exerciseId}:${entry.sha256}`);
    summary.created += 1;
  }

  // GIF recusado na revisão humana: remove o vínculo que já exista no catálogo do
  // sistema (ex.: importado antes da recusa). Nunca apaga o objeto no R2.
  const rejectedKeys = manifest.filter((entry) => entry.rejectedByReview).map((entry) => entry.storageKey);
  if (rejectedKeys.length > 0) {
    const where = { storageKey: { in: rejectedKeys }, exercise: { createdByProfessionalId: system.id } };
    summary.removedRejected = options.dryRun
      ? await prisma.exerciseMedia.count({ where })
      : (await prisma.exerciseMedia.deleteMany({ where })).count;
  }

  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = validateManifest(JSON.parse(readFileSync(join(__dirname, 'data', 'exercise-media-manifest.json'), 'utf-8')));
  const verifier = createR2KeyVerifier((key) => process.env[key]);
  if (!verifier && manifest.some((entry) => entry.storageKeySource === 'derived' && (entry.matchStatus === 'EXACT' || entry.matchStatus === 'MATCHED'))) {
    console.warn(
      'EXERCISE_MEDIA_S3_* não configurado: chaves deduzidas não podem ser conferidas no R2 e serão ignoradas. ' +
        'Rode com as credenciais do R2 no ambiente ou regere o manifesto com --r2-listing.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const summary = await importExerciseMedia(prisma, manifest, { verifier, dryRun });
    const skipped = Object.entries(summary.skipped)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ');
    console.log(
      `${dryRun ? '[dry-run] ' : ''}Mídia de exercício: ${summary.safeEntries} registro(s) EXACT/MATCHED, ` +
        `${summary.created} ${dryRun ? 'seriam criados' : 'criados'}, ` +
        `${summary.removedRejected} vínculo(s) recusado(s) ${dryRun ? 'seriam removidos' : 'removidos'}, ignorados: ${skipped || 'nenhum'} ` +
        `(conferência: ${summary.verification}).`,
    );
    if (summary.problems.length > 0) {
      console.error(`Problemas (${summary.problems.length}):\n - ${summary.problems.join('\n - ')}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
