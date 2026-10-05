import { readFileSync } from 'fs';
import { join } from 'path';
import { ExerciseMediaCurationStatus, ExerciseMediaSex, ExerciseMediaView, ExerciseScope, PrismaClient } from '@prisma/client';
import { SYSTEM_PROFESSIONAL_EMAIL } from './import-reference-data';

/**
 * Aplica a curadoria visual (data/exercise-media-curation.json) às mídias JÁ
 * vinculadas do catálogo do sistema: status, principal, ordem, sexo, vista,
 * equipamento, variação, arquivo de origem, data da revisão e motivo da recusa.
 *
 * Nunca cria, apaga nem move mídia; nunca altera storageKey, sha256, tamanho
 * ou exercício — e não toca no R2. Cada mídia é localizada por exercício do
 * sistema + storageKey e conferida pelo sha256 (os IDs mudam entre bancos).
 * Tudo ou nada: se alguma das mídias não for encontrada exatamente como na
 * curadoria, nada é gravado. Idempotente: reaplicar não muda nada.
 *
 * Por padrão só relata (dry-run). Para gravar é preciso pedir explicitamente
 * --apply E dizer qual banco se espera atingir (host:porta/banco, sem
 * credencial) — se o DATABASE_URL apontar para outro banco, nada é feito.
 *
 * Uso (a partir de backend/):
 *   npm run reference-data:apply-exercise-media-curation                      (só relata)
 *   npm run reference-data:apply-exercise-media-curation -- --apply --expect-target=localhost:5432/bocado_dev
 */

export interface CurationEntry {
  exerciseName: string;
  storageKey: string;
  sha256: string;
  sourceFileName: string;
  /** Só referência para auditoria; não é usado para localizar a mídia. */
  productionMediaId?: string;
  status: 'approved' | 'rejected';
  isPrimary?: boolean;
  sortOrder?: number;
  sex?: ExerciseMediaSex;
  view?: ExerciseMediaView;
  equipment?: string;
  variation?: string;
  rejectionReason?: string;
}

export interface CurationFile {
  reviewedAt: string;
  entries: CurationEntry[];
}

const SEXES = Object.values(ExerciseMediaSex) as string[];
const VIEWS = Object.values(ExerciseMediaView) as string[];

/** Confere o arquivo de curadoria; lança com todos os problemas encontrados. */
export function validateCuration(raw: unknown): CurationFile {
  const file = raw as CurationFile;
  const problems: string[] = [];
  if (!file || !Array.isArray(file.entries)) throw new Error('Curadoria inválida: falta "entries".');
  if (typeof file.reviewedAt !== 'string' || Number.isNaN(Date.parse(file.reviewedAt))) problems.push('reviewedAt ausente ou inválido.');

  const keys = new Set<string>();
  const primaries = new Map<string, number>();
  const approvedByExercise = new Map<string, number>();
  for (const [i, entry] of file.entries.entries()) {
    const at = `#${i + 1} (${entry?.storageKey ?? '?'})`;
    if (!entry?.exerciseName || !entry.storageKey || !entry.sourceFileName) problems.push(`${at}: exerciseName, storageKey e sourceFileName são obrigatórios.`);
    if (!/^[0-9a-f]{64}$/.test(entry?.sha256 ?? '')) problems.push(`${at}: sha256 inválido.`);
    if (keys.has(entry?.storageKey)) problems.push(`${at}: storageKey repetida.`);
    keys.add(entry?.storageKey);

    if (entry?.status === 'approved') {
      approvedByExercise.set(entry.exerciseName, (approvedByExercise.get(entry.exerciseName) ?? 0) + 1);
      if (typeof entry.isPrimary !== 'boolean') problems.push(`${at}: aprovada sem isPrimary.`);
      if (entry.isPrimary) primaries.set(entry.exerciseName, (primaries.get(entry.exerciseName) ?? 0) + 1);
      if (!Number.isInteger(entry.sortOrder) || entry.sortOrder! < 0) problems.push(`${at}: aprovada sem sortOrder válido.`);
      if (!SEXES.includes(entry.sex as string)) problems.push(`${at}: sex inválido.`);
      if (!VIEWS.includes(entry.view as string)) problems.push(`${at}: view inválida.`);
      if (entry.rejectionReason) problems.push(`${at}: aprovada não pode ter rejectionReason.`);
    } else if (entry?.status === 'rejected') {
      if (!entry.rejectionReason?.trim()) problems.push(`${at}: recusada sem rejectionReason.`);
      if (entry.isPrimary) problems.push(`${at}: recusada não pode ser principal.`);
    } else {
      problems.push(`${at}: status deve ser approved ou rejected.`);
    }
  }
  for (const [name] of approvedByExercise) {
    if ((primaries.get(name) ?? 0) !== 1) problems.push(`${name}: precisa de exatamente uma mídia principal aprovada.`);
  }
  for (const [name, count] of primaries) {
    if (!approvedByExercise.has(name) || count > 1) problems.push(`${name}: mais de uma mídia principal.`);
  }
  if (problems.length > 0) throw new Error(`Curadoria inválida:\n - ${problems.join('\n - ')}`);
  return file;
}

export interface ApplyCurationSummary {
  dryRun: boolean;
  entries: number;
  updated: number;
  unchanged: number;
  approved: number;
  rejected: number;
  /** Mídias desses exercícios que não constam da curadoria (ficam como estão). */
  untouchedOtherMedia: number;
  problems: string[];
}

export async function applyExerciseMediaCuration(
  prisma: PrismaClient,
  curation: CurationFile,
  options: { dryRun: boolean },
): Promise<ApplyCurationSummary> {
  const summary: ApplyCurationSummary = {
    dryRun: options.dryRun,
    entries: curation.entries.length,
    updated: 0,
    unchanged: 0,
    approved: curation.entries.filter((entry) => entry.status === 'approved').length,
    rejected: curation.entries.filter((entry) => entry.status === 'rejected').length,
    untouchedOtherMedia: 0,
    problems: [],
  };

  const system = await prisma.user.findUnique({ where: { email: SYSTEM_PROFESSIONAL_EMAIL } });
  if (!system) throw new Error('Catálogo do sistema não encontrado — rode "npm run reference-data:import" antes.');

  // Só o catálogo do sistema — nunca exercícios de profissionais com o mesmo nome.
  const names = [...new Set(curation.entries.map((entry) => entry.exerciseName))];
  const exercises = await prisma.exercise.findMany({
    where: { name: { in: names }, scope: ExerciseScope.global, createdByProfessionalId: system.id },
    select: { id: true, name: true },
  });
  const idsByName = new Map<string, string[]>();
  for (const exercise of exercises) idsByName.set(exercise.name, [...(idsByName.get(exercise.name) ?? []), exercise.id]);

  const media = await prisma.exerciseMedia.findMany({ where: { exerciseId: { in: exercises.map((exercise) => exercise.id) } } });
  const reviewedAt = new Date(curation.reviewedAt);
  const curatedIds = new Set<string>();
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  for (const entry of curation.entries) {
    const ids = idsByName.get(entry.exerciseName) ?? [];
    if (ids.length !== 1) {
      summary.problems.push(`${entry.exerciseName}: ${ids.length === 0 ? 'exercício não existe' : 'mais de um exercício'} no catálogo do sistema.`);
      continue;
    }
    const found = media.filter((row) => row.exerciseId === ids[0] && row.storageKey === entry.storageKey);
    if (found.length !== 1) {
      summary.problems.push(`${entry.exerciseName}: ${found.length === 0 ? 'mídia não vinculada' : 'mídia vinculada mais de uma vez'} (${entry.storageKey}).`);
      continue;
    }
    const row = found[0];
    if (row.sha256 !== entry.sha256) {
      summary.problems.push(`${entry.storageKey}: sha256 do banco difere da curadoria — não alterado.`);
      continue;
    }
    curatedIds.add(row.id);

    const approved = entry.status === 'approved';
    const data = {
      curationStatus: approved ? ExerciseMediaCurationStatus.approved : ExerciseMediaCurationStatus.rejected,
      isPrimary: approved ? entry.isPrimary! : false,
      sortOrder: approved ? entry.sortOrder! : 0,
      sex: approved ? entry.sex! : ExerciseMediaSex.unspecified,
      view: approved ? entry.view! : ExerciseMediaView.unspecified,
      equipment: approved ? (entry.equipment ?? null) : null,
      variation: approved ? (entry.variation ?? null) : null,
      sourceFileName: entry.sourceFileName,
      reviewedAt,
      rejectionReason: approved ? null : entry.rejectionReason!,
    };
    const same = (Object.keys(data) as (keyof typeof data)[]).every((field) =>
      field === 'reviewedAt' ? row.reviewedAt?.getTime() === reviewedAt.getTime() : row[field] === data[field],
    );
    if (same) summary.unchanged += 1;
    else updates.push({ id: row.id, data });
  }

  // Outra mídia (fora da curadoria) marcada como principal num desses exercícios
  // quebraria a regra de uma principal por exercício.
  for (const row of media) {
    if (curatedIds.has(row.id)) continue;
    summary.untouchedOtherMedia += 1;
    const exerciseName = exercises.find((exercise) => exercise.id === row.exerciseId)?.name;
    const curatedPrimary = curation.entries.some((entry) => entry.exerciseName === exerciseName && entry.isPrimary);
    if (row.isPrimary && curatedPrimary) summary.problems.push(`${exerciseName}: outra mídia já é principal (${row.storageKey}).`);
  }

  // Tudo ou nada.
  if (summary.problems.length > 0) return summary;
  summary.updated = updates.length;
  if (!options.dryRun && updates.length > 0) {
    await prisma.$transaction(updates.map(({ id, data }) => prisma.exerciseMedia.update({ where: { id }, data })));
  }
  return summary;
}

/** Banco apontado pelo DATABASE_URL como host:porta/banco — nunca usuário ou senha. */
export function describeDatabaseTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error('DATABASE_URL não configurado.');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL inválido.');
  }
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

/**
 * Sem --apply é sempre dry-run. Com --apply, exige --expect-target igual ao
 * banco do DATABASE_URL — evita gravar no banco errado (ex.: túnel de produção
 * aberto quando se queria o local).
 */
export function parseCurationRunOptions(argv: string[], databaseUrl: string | undefined): { dryRun: boolean; target: string } {
  const target = describeDatabaseTarget(databaseUrl);
  const apply = argv.includes('--apply');
  if (apply && argv.includes('--dry-run')) throw new Error('Use --apply OU --dry-run, não os dois.');
  if (!apply) return { dryRun: true, target };
  const expected = argv.find((arg) => arg.startsWith('--expect-target='))?.slice('--expect-target='.length);
  if (!expected) throw new Error(`Para gravar, passe também --expect-target=${target} (banco alvo atual).`);
  if (expected !== target) throw new Error(`Banco alvo é ${target}, mas --expect-target=${expected}. Nada foi gravado.`);
  return { dryRun: false, target };
}

async function main() {
  const { dryRun, target } = parseCurationRunOptions(process.argv.slice(2), process.env.DATABASE_URL);
  console.log(`Banco alvo: ${target} — ${dryRun ? 'DRY-RUN (só leitura)' : 'GRAVAÇÃO (--apply)'}`);
  const curation = validateCuration(JSON.parse(readFileSync(join(__dirname, 'data', 'exercise-media-curation.json'), 'utf-8')));
  const prisma = new PrismaClient();
  try {
    const summary = await applyExerciseMediaCuration(prisma, curation, { dryRun });
    if (summary.problems.length > 0) {
      console.error(`Curadoria NÃO aplicada — nada foi gravado. Problemas (${summary.problems.length}):\n - ${summary.problems.join('\n - ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${dryRun ? '[dry-run] ' : ''}Curadoria de mídia: ${summary.entries} mídia(s) (${summary.approved} aprovadas, ${summary.rejected} recusadas), ` +
        `${summary.updated} ${dryRun ? 'seriam atualizadas' : 'atualizadas'}, ${summary.unchanged} já estavam assim, ` +
        `${summary.untouchedOtherMedia} outra(s) mídia(s) desses exercícios não tocada(s).`,
    );
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
