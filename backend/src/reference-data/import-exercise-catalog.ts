/**
 * Importa a biblioteca de exercícios (`data/catalogo_exercicios.json`, montado da lista de GIFs do R2)
 * para a tabela de exercícios, ligando cada um ao seu GIF.
 *
 * - Exercício oficial que já existe com o mesmo nome (sem acento/caixa) é ATUALIZADO (mesmo id: os treinos
 *   que já o usam passam a mostrar o GIF novo); os demais são criados como oficiais aprovados.
 * - O GIF de cada um vira a mídia principal aprovada. Mídias antigas cujo arquivo não está no catálogo
 *   (os GIFs em inglês removidos do bucket) ficam "recusadas" com o motivo — nunca apagadas.
 * - Exercícios oficiais antigos que não estão no catálogo saem da biblioteca e da IA (approvedAt = null);
 *   continuam nos treinos que já os usam. Exercícios particulares dos profissionais não são tocados.
 * - --catalog-editor-email=<e-mail>: liga a permissão de editar o catálogo oficial para essa conta.
 *
 * Sem --apply é só leitura (mostra o que faria). Para gravar:
 *   npx ts-node src/reference-data/import-exercise-catalog.ts --apply --expect-target=localhost:5432/bocado_dev
 * Idempotente: rodar de novo não duplica nada.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExerciseMediaCurationStatus, ExerciseScope, ExerciseType, PrismaClient } from '@prisma/client';
import { normalizeExerciseName } from '../exercises/exercise-name-matching';
import { SYSTEM_PROFESSIONAL_EMAIL } from './import-reference-data';
import type { CatalogEntry } from './build-exercise-catalog-from-r2';

/**
 * Exercícios oficiais antigos com nome diferente, mas equivalente claro no catálogo novo: viram esse
 * exercício (mesmo id — os treinos que já os usam passam a mostrar o GIF). Os sem equivalente saem da biblioteca.
 */
export const OLD_TO_CATALOG: Record<string, string> = {
  'Elevação pélvica (hip thrust)': 'Elevação Pélvica com Barra',
  'Elevação lateral': 'Elevação Lateral em Pé com Halteres',
  'Elíptico': 'Caminhada no Elíptico',
  'Panturrilha em pé': 'Elevação de Panturrilha em Pé',
  'Puxada frontal (pulley)': 'Puxada na Polia',
  'Desenvolvimento militar': 'Desenvolvimento Militar Sentado no Rack com Barra',
  'Rosca direta': 'Rosca Direta com Barra',
  'Leg press 45°': 'Leg Press 45 Graus',
  'Levantamento terra': 'Levantamento Terra com Barra',
  'Bicicleta ergométrica': 'Bicicleta Ergométrica Leve',
  'Remo ergométrico': 'Remo Ergômetro',
  'Alongamento de panturrilha': 'Alongamento de Panturrilhas',
  'Rotação de tronco': 'Rotação de Tronco em Pé',
  'Afundo (passada)': 'Avanço',
  'Barra fixa (pull-up)': 'Barra Fixa',
  'Prancha abdominal': 'Prancha Frontal',
  'Mergulho no banco (bench dip)': 'Mergulho no Banco (Joelhos Flexionados)',
  'Mobilidade de quadril (90/90)': '90-90 de Quadril (Iniciante)',
  'Remada baixa (polia)': 'Remada Baixa Sentada na Polia',
  'Tríceps corda (polia)': 'Tríceps Corda na Polia',
};

export const OLD_GIF_REJECTION = 'GIF antigo removido do bucket na troca pela biblioteca nova (out/2026).';

export interface CatalogImportReport {
  catalog: number;
  updated: number;
  created: number;
  mediaCreated: number;
  oldMediaRejected: number;
  oldExercisesHidden: string[];
  matchedByName: string[];
  catalogEditor: string | null;
}

function targetOf(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error('DATABASE_URL não definido.');
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`.replace(/\/$/, '');
}

function parseOptions(argv: string[], databaseUrl: string | undefined) {
  const target = targetOf(databaseUrl).replace(/^(.*):(\d+)\/(.*)$/, '$1:$2/$3');
  const apply = argv.includes('--apply');
  const editorEmail = argv.find((a) => a.startsWith('--catalog-editor-email='))?.slice('--catalog-editor-email='.length) ?? null;
  if (!apply) return { dryRun: true, target, editorEmail };
  const expected = argv.find((a) => a.startsWith('--expect-target='))?.slice('--expect-target='.length);
  if (!expected) throw new Error(`Para gravar, passe também --expect-target=${target} (banco alvo atual).`);
  if (expected !== target) throw new Error(`Banco alvo é ${target}, mas --expect-target=${expected}. Nada foi gravado.`);
  return { dryRun: false, target, editorEmail };
}

const TYPES = new Set<string>(Object.values(ExerciseType));
const slugOf = (key: string) =>
  'biblioteca:' +
  normalizeExerciseName(key.replace(/^exercises\//, '').replace(/\.gif$/i, ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function importExerciseCatalog(prisma: PrismaClient, catalog: CatalogEntry[], dryRun: boolean, editorEmail: string | null): Promise<CatalogImportReport> {
  const system = await prisma.user.findUnique({ where: { email: SYSTEM_PROFESSIONAL_EMAIL }, select: { id: true } });
  if (!system) throw new Error('Profissional do sistema não encontrado — rode antes a importação de dados de referência.');

  const globals = await prisma.exercise.findMany({
    // Só o catálogo oficial (do profissional do sistema): exercícios de profissionais nunca são tocados.
    where: { scope: ExerciseScope.global, createdByProfessionalId: system.id },
    select: { id: true, name: true, approvedAt: true, media: { select: { id: true, storageKey: true, curationStatus: true, isPrimary: true } } },
  });
  const byName = new Map(globals.map((g) => [normalizeExerciseName(g.name), g]));
  // Equivalências: só quando o catálogo não tem um antigo com o nome exato.
  for (const g of globals) {
    const target = OLD_TO_CATALOG[g.name];
    if (target && !byName.has(normalizeExerciseName(target))) byName.set(normalizeExerciseName(target), g);
  }
  const catalogKeys = new Set(catalog.map((c) => c.gif_key));
  const byGif = new Map(globals.flatMap((g) => g.media.map((m) => [m.storageKey, g] as const)));
  const now = new Date();

  const report: CatalogImportReport = { catalog: catalog.length, updated: 0, created: 0, mediaCreated: 0, oldMediaRejected: 0, oldExercisesHidden: [], matchedByName: [], catalogEditor: null };
  const matchedIds = new Set<string>();
  const newExercises: Array<Record<string, unknown>> = [];
  const newMedia: Array<Record<string, unknown>> = [];

  const mediaRow = (exerciseId: string, entry: CatalogEntry) => ({
    id: randomUUID(),
    exerciseId,
    storageKey: entry.gif_key,
    contentType: 'image/gif',
    sizeBytes: entry.tamanho_bytes,
    sha256: null,
    curationStatus: ExerciseMediaCurationStatus.approved,
    isPrimary: true,
    sortOrder: 0,
    equipment: entry.equipamento,
    sourceFileName: entry.gif_key.split('/').pop() ?? null,
    reviewedAt: now,
  });

  for (const entry of catalog) {
    const fields = {
      name: entry.nome,
      muscleGroups: entry.grupos_musculares,
      muscleGroup: entry.grupos_musculares[0] ?? null,
      equipment: entry.equipamento,
      section: entry.secao,
      type: (TYPES.has(entry.tipo) ? entry.tipo : 'other') as ExerciseType,
    };
    // Primeiro pelo próprio GIF (rodar de novo nunca troca de exercício); senão pelo nome — desde que esse
    // exercício ainda não tenha outro GIF da biblioteca (dois nomes que só diferem por parênteses ficam separados).
    const byNameCandidate = byName.get(normalizeExerciseName(entry.nome));
    const existing =
      byGif.get(entry.gif_key) ??
      (byNameCandidate && !byNameCandidate.media.some((m) => catalogKeys.has(m.storageKey) && m.storageKey !== entry.gif_key) ? byNameCandidate : undefined);
    if (existing && !matchedIds.has(existing.id)) {
      matchedIds.add(existing.id);
      report.updated++;
      report.matchedByName.push(entry.nome);
      const hasThisGif = existing.media.some((m) => m.storageKey === entry.gif_key);
      if (!dryRun) {
        await prisma.exercise.update({ where: { id: existing.id }, data: { ...fields, approvedAt: existing.approvedAt ?? now } });
        // O GIF da biblioteca passa a ser o principal; outros GIFs do exercício deixam de ser.
        await prisma.exerciseMedia.updateMany({ where: { exerciseId: existing.id, storageKey: { not: entry.gif_key } }, data: { isPrimary: false } });
        if (hasThisGif) {
          await prisma.exerciseMedia.updateMany({
            where: { exerciseId: existing.id, storageKey: entry.gif_key },
            data: { isPrimary: true, curationStatus: ExerciseMediaCurationStatus.approved, rejectionReason: null },
          });
        }
      }
      if (!hasThisGif) {
        newMedia.push(mediaRow(existing.id, entry));
        report.mediaCreated++;
      }
      continue;
    }
    const id = randomUUID();
    newExercises.push({ id, ...fields, scope: ExerciseScope.global, approvedAt: now, createdByProfessionalId: system.id, slug: slugOf(entry.gif_key) });
    newMedia.push(mediaRow(id, entry));
    report.created++;
    report.mediaCreated++;
  }

  // Exercícios criados por uma importação anterior (mesma slug) não são duplicados.
  const existingSlugs = new Set(
    (await prisma.exercise.findMany({ where: { slug: { in: newExercises.map((e) => e.slug as string) } }, select: { slug: true } })).map((e) => e.slug),
  );
  const toCreate = newExercises.filter((e) => !existingSlugs.has(e.slug as string));
  const createdIds = new Set(toCreate.map((e) => e.id as string));
  const mediaToCreate = newMedia.filter((m) => createdIds.has(m.exerciseId as string) || matchedIds.has(m.exerciseId as string));
  report.created = toCreate.length;
  report.mediaCreated = mediaToCreate.length;

  // GIFs antigos (fora do catálogo) e exercícios oficiais antigos fora do catálogo.
  const oldMediaIds = globals.flatMap((g) => g.media).filter((m) => !catalogKeys.has(m.storageKey) && m.curationStatus !== ExerciseMediaCurationStatus.rejected).map((m) => m.id);
  report.oldMediaRejected = oldMediaIds.length;
  const hidden = globals.filter((g) => !matchedIds.has(g.id) && g.approvedAt !== null && !g.media.some((m) => catalogKeys.has(m.storageKey)));
  report.oldExercisesHidden = hidden.map((g) => g.name);

  let editorId: string | null = null;
  if (editorEmail) {
    const user = await prisma.user.findUnique({ where: { email: editorEmail }, select: { id: true, professional: { select: { id: true } } } });
    if (!user?.professional) throw new Error(`Nenhum profissional com o e-mail informado em --catalog-editor-email.`);
    editorId = user.professional.id;
    report.catalogEditor = editorEmail;
  }

  if (!dryRun) {
    for (let i = 0; i < toCreate.length; i += 500) await prisma.exercise.createMany({ data: toCreate.slice(i, i + 500) as never });
    for (let i = 0; i < mediaToCreate.length; i += 500) await prisma.exerciseMedia.createMany({ data: mediaToCreate.slice(i, i + 500) as never });
    if (oldMediaIds.length > 0) {
      await prisma.exerciseMedia.updateMany({
        where: { id: { in: oldMediaIds } },
        data: { curationStatus: ExerciseMediaCurationStatus.rejected, isPrimary: false, rejectionReason: OLD_GIF_REJECTION, reviewedAt: now },
      });
    }
    if (hidden.length > 0) await prisma.exercise.updateMany({ where: { id: { in: hidden.map((g) => g.id) } }, data: { approvedAt: null } });
    if (editorId) await prisma.professional.update({ where: { id: editorId }, data: { canEditCatalog: true } });
  }
  return report;
}

async function main() {
  const { dryRun, target, editorEmail } = parseOptions(process.argv.slice(2), process.env.DATABASE_URL);
  console.log(`Banco alvo: ${target} — ${dryRun ? 'DRY-RUN (só leitura)' : 'GRAVAÇÃO (--apply)'}`);
  const catalog = JSON.parse(readFileSync(join(__dirname, 'data', 'catalogo_exercicios.json'), 'utf8')) as CatalogEntry[];
  const prisma = new PrismaClient();
  try {
    const t0 = Date.now();
    const report = await importExerciseCatalog(prisma, catalog, dryRun, editorEmail);
    console.log(JSON.stringify({ ...report, oldExercisesHidden: { total: report.oldExercisesHidden.length, nomes: report.oldExercisesHidden } }, null, 1));
    console.log(`(${Date.now() - t0} ms)`);
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
