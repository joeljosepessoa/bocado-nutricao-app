import { PrismaClient } from '@prisma/client';
import { importReferenceData } from '../src/reference-data/import-reference-data';
import { importExerciseMedia, KeyCheck, StorageKeyVerifier } from '../src/reference-data/import-exercise-media';
import type { ManifestEntry } from '../src/reference-data/exercise-media-catalog';

// Banco real (dev/teste), R2 simulado: o verificador é um dublê — nenhuma chamada ao Cloudflare.
const prisma = new PrismaClient();
const RUN = `e2e-${Date.now()}`;
const PREFIX = `exercises/${RUN}/`;

const entry = (file: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  storageKey: `${PREFIX}biceps/${file}`,
  storageKeySource: 'derived',
  fileName: file,
  equipment: 'barras',
  muscleGroup: 'biceps',
  normalizedName: 'barbell curl',
  sha256: file.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a').slice(0, 64),
  sizeBytes: 100,
  contentType: 'image/gif',
  exerciseName: 'Rosca direta',
  matchStatus: 'MATCHED',
  confidence: 'high',
  reason: 'alias',
  candidates: [],
  ...overrides,
});

const verifierWith = (results: Record<string, KeyCheck> = {}) => {
  const check = jest.fn(async (key: string) => results[key] ?? 'ok');
  return { verifier: { check } as StorageKeyVerifier, check };
};

describe('Importador de mídia de exercício (e2e, banco real)', () => {
  let roscaId: string;

  beforeAll(async () => {
    const { systemProfessionalId } = await importReferenceData(prisma);
    roscaId = (await prisma.exercise.findFirstOrThrow({ where: { name: 'Rosca direta', createdByProfessionalId: systemProfessionalId } })).id;
  });

  afterAll(async () => {
    await prisma.exerciseMedia.deleteMany({ where: { storageKey: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('dry-run relata sem gravar nada', async () => {
    const { verifier } = verifierWith();
    const summary = await importExerciseMedia(prisma, [entry('a1.gif')], { verifier, dryRun: true });
    expect(summary.created).toBe(1);
    expect(await prisma.exerciseMedia.count({ where: { storageKey: { startsWith: PREFIX } } })).toBe(0);
  });

  it('cria só EXACT/MATCHED com chave, gif, tamanho e sha256 — e é idempotente (2ª execução não duplica)', async () => {
    const manifest = [
      entry('b1.gif', { sha256: 'b'.repeat(64) }),
      entry('b2.gif', { sha256: 'c'.repeat(64), matchStatus: 'EXACT' }),
      entry('b3.gif', { matchStatus: 'REVIEW', exerciseName: null, sha256: 'd'.repeat(64) }),
      entry('b4.gif', { matchStatus: 'UNMATCHED', exerciseName: null, sha256: 'e'.repeat(64) }),
    ];
    const { verifier } = verifierWith();

    const first = await importExerciseMedia(prisma, manifest, { verifier, dryRun: false });
    expect(first).toMatchObject({ safeEntries: 2, created: 2 });
    const rows = await prisma.exerciseMedia.findMany({ where: { storageKey: { startsWith: `${PREFIX}biceps/b` } }, orderBy: { storageKey: 'asc' } });
    expect(rows.map((r) => [r.storageKey.slice(PREFIX.length), r.exerciseId, r.contentType, r.sizeBytes, r.sha256])).toEqual([
      ['biceps/b1.gif', roscaId, 'image/gif', 100, 'b'.repeat(64)],
      ['biceps/b2.gif', roscaId, 'image/gif', 100, 'c'.repeat(64)],
    ]);
    // Só a chave é gravada — nunca URL.
    expect(rows.every((r) => !/^https?:|X-Amz/i.test(r.storageKey))).toBe(true);

    const second = await importExerciseMedia(prisma, manifest, { verifier, dryRun: false });
    expect(second.created).toBe(0);
    expect(second.skipped['already-imported']).toBe(2);
    expect(await prisma.exerciseMedia.count({ where: { storageKey: { startsWith: `${PREFIX}biceps/b` } } })).toBe(2);
  });

  it('não duplica pela mesma chave no lote nem pelo mesmo conteúdo (sha256) no mesmo exercício', async () => {
    const { verifier } = verifierWith();
    const summary = await importExerciseMedia(
      prisma,
      [entry('c1.gif', { sha256: 'f'.repeat(64) }), entry('c1.gif', { sha256: 'f'.repeat(64) }), entry('c2.gif', { sha256: 'f'.repeat(64) })],
      { verifier, dryRun: false },
    );
    expect(summary.created).toBe(1);
    expect(summary.skipped['already-imported']).toBe(1);
    expect(summary.skipped['duplicate-content-same-exercise']).toBe(1);
  });

  it('chave já vinculada a OUTRO exercício é conflito — nunca move', async () => {
    const { verifier } = verifierWith();
    await importExerciseMedia(prisma, [entry('d1.gif', { sha256: '1'.repeat(64) })], { verifier, dryRun: false });
    const summary = await importExerciseMedia(prisma, [entry('d1.gif', { sha256: '1'.repeat(64), exerciseName: 'Supino reto com barra' })], {
      verifier,
      dryRun: false,
    });
    expect(summary.skipped['key-linked-to-other-exercise']).toBe(1);
    expect((await prisma.exerciseMedia.findFirstOrThrow({ where: { storageKey: `${PREFIX}biceps/d1.gif` } })).exerciseId).toBe(roscaId);
  });

  it('exercício inexistente no catálogo do sistema é relatado e não grava (nunca inventa id)', async () => {
    const { verifier } = verifierWith();
    const summary = await importExerciseMedia(prisma, [entry('e1.gif', { exerciseName: 'Exercício que não existe', sha256: '2'.repeat(64) })], {
      verifier,
      dryRun: false,
    });
    expect(summary.skipped['exercise-not-found']).toBe(1);
    expect(summary.problems[0]).toMatch(/não existe no catálogo/);
    expect(await prisma.exerciseMedia.count({ where: { storageKey: `${PREFIX}biceps/e1.gif` } })).toBe(0);
  });

  it('chave ausente ou com tamanho diferente no bucket não é gravada', async () => {
    const { verifier } = verifierWith({ [`${PREFIX}biceps/f1.gif`]: 'missing', [`${PREFIX}biceps/f2.gif`]: 'size-mismatch' });
    const summary = await importExerciseMedia(
      prisma,
      [entry('f1.gif', { sha256: '3'.repeat(64) }), entry('f2.gif', { sha256: '4'.repeat(64) })],
      { verifier, dryRun: false },
    );
    expect(summary.created).toBe(0);
    expect(summary.skipped['key-missing-in-bucket']).toBe(1);
    expect(summary.skipped['key-size-mismatch']).toBe(1);
  });

  it('sem credenciais do R2: chave deduzida é ignorada; só chave conferida na listagem real do bucket é gravada', async () => {
    const summary = await importExerciseMedia(
      prisma,
      [entry('g1.gif', { sha256: '5'.repeat(64) }), entry('g2.gif', { sha256: '6'.repeat(64), storageKeySource: 'r2-listing' })],
      { verifier: null, dryRun: false },
    );
    expect(summary.verification).toBe('listing-only');
    expect(summary.skipped['key-unverified']).toBe(1);
    expect(summary.created).toBe(1);
    expect(await prisma.exerciseMedia.count({ where: { storageKey: `${PREFIX}biceps/g2.gif` } })).toBe(1);
  });
});
