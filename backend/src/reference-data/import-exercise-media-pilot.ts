import { ExerciseScope, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { constants, existsSync, mkdirSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { SYSTEM_PROFESSIONAL_EMAIL } from './import-reference-data';

/**
 * Piloto de GIFs de exercício (30 exercícios do catálogo do sistema) —
 * NÃO é o importador da biblioteca inteira.
 *
 * - Só LÊ a biblioteca original (nunca move nem altera): copia cada GIF
 *   para `<STORAGE_LOCAL_DIR>/exercise-media/<sha256>.gif`, a chave que
 *   `ExerciseMediaController` serve via StorageService.
 * - Confere o SHA-256 do arquivo de origem contra o manifesto antes de
 *   copiar (protege contra arquivo trocado/corrompido).
 * - Liga só às linhas do catálogo do sistema (profissional do
 *   reference-data:import), nunca aos resíduos de teste com o mesmo nome.
 * - `Exercise.imageUrl` = `/exercise-media/<sha256>` (caminho relativo,
 *   resolvido pelo cliente contra a URL da API). Sem migration.
 *
 * Uso (a partir de backend/):
 *   EXERCISE_MEDIA_SOURCE_DIR="<pasta da biblioteca>" npm run reference-data:import-exercise-media-pilot
 *   ... -- --dry-run   (só valida; não copia nem grava no banco)
 */

interface PilotEntry {
  exerciseName: string;
  sourcePath: string;
  sha256: string;
  bytes: number;
  match: string;
}

export const EXERCISE_MEDIA_URL_PREFIX = '/exercise-media/';
const STORAGE_SUBDIR = 'exercise-media';

function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sourceDir = process.env.EXERCISE_MEDIA_SOURCE_DIR;
  if (!sourceDir) {
    throw new Error('Defina EXERCISE_MEDIA_SOURCE_DIR com a pasta da biblioteca de GIFs (somente leitura).');
  }
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') {
    throw new Error('O piloto copia para o storage local. Com STORAGE_PROVIDER=s3, envie os arquivos ao bucket com a mesma chave exercise-media/<sha256>.gif.');
  }

  const storageDir = resolve(process.env.STORAGE_LOCAL_DIR ?? '../storage', STORAGE_SUBDIR);
  const manifest = JSON.parse(
    readFileSync(join(__dirname, 'data', 'exercise-media-pilot.json'), 'utf-8'),
  ) as PilotEntry[];

  const prisma = new PrismaClient();
  try {
    const system = await prisma.user.findUnique({ where: { email: SYSTEM_PROFESSIONAL_EMAIL } });
    if (!system) {
      throw new Error('Catálogo do sistema não encontrado — rode "npm run reference-data:import" antes.');
    }

    if (!dryRun) {
      mkdirSync(storageDir, { recursive: true });
    }

    let copied = 0;
    let alreadyStored = 0;
    let linked = 0;
    const problems: string[] = [];

    for (const entry of manifest) {
      const source = join(resolve(sourceDir), ...entry.sourcePath.split('/'));
      if (!existsSync(source)) {
        problems.push(`${entry.exerciseName}: arquivo de origem não encontrado (${entry.sourcePath})`);
        continue;
      }
      if (sha256OfFile(source) !== entry.sha256) {
        problems.push(`${entry.exerciseName}: SHA-256 do arquivo de origem difere do manifesto`);
        continue;
      }

      const exercise = await prisma.exercise.findFirst({
        where: { name: entry.exerciseName, scope: ExerciseScope.global, createdByProfessionalId: system.id },
      });
      if (!exercise) {
        problems.push(`${entry.exerciseName}: exercício não existe no catálogo do sistema`);
        continue;
      }

      const destination = join(storageDir, `${entry.sha256}.gif`);
      if (existsSync(destination)) {
        alreadyStored += 1;
      } else if (!dryRun) {
        // COPYFILE_EXCL: nunca sobrescreve; a origem é só lida.
        copyFileSync(source, destination, constants.COPYFILE_EXCL);
        copied += 1;
      }

      if (!dryRun) {
        await prisma.exercise.update({
          where: { id: exercise.id },
          data: {
            imageUrl: `${EXERCISE_MEDIA_URL_PREFIX}${entry.sha256}`,
            // Catálogo do sistema é conteúdo de referência: precisa estar
            // aprovado para ficar visível a outros profissionais (Fase 15).
            approvedAt: exercise.approvedAt ?? new Date(),
          },
        });
      }
      linked += 1;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}Piloto de GIFs: ${linked}/${manifest.length} exercícios validados/vinculados, ` +
        `${copied} arquivo(s) copiado(s), ${alreadyStored} já estavam no storage.`,
    );
    if (problems.length > 0) {
      console.error(`Problemas (${problems.length}):\n - ${problems.join('\n - ')}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
