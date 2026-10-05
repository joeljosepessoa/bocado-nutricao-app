import { readFileSync } from 'fs';
import { join } from 'path';
import { applyExerciseMediaCuration, CurationEntry, CurationFile, parseCurationRunOptions, validateCuration } from './apply-exercise-media-curation';

const realCuration = (): CurationFile =>
  validateCuration(JSON.parse(readFileSync(join(__dirname, 'data', 'exercise-media-curation.json'), 'utf-8')));

const sha = (c: string) => c.repeat(64);
const approved = (over: Partial<CurationEntry> = {}): CurationEntry => ({
  exerciseName: 'Rosca direta',
  storageKey: 'exercises/barras/biceps/a.gif',
  sha256: sha('a'),
  sourceFileName: 'a.gif',
  status: 'approved',
  isPrimary: true,
  sortOrder: 0,
  sex: 'male',
  view: 'front',
  equipment: 'barra reta',
  variation: 'pegada supinada',
  ...over,
});
const rejected = (over: Partial<CurationEntry> = {}): CurationEntry => ({
  exerciseName: 'Rosca direta',
  storageKey: 'exercises/barras/biceps/b.gif',
  sha256: sha('b'),
  sourceFileName: 'b.gif',
  status: 'rejected',
  rejectionReason: 'Duplicata: mesma execução, outro modelo.',
  ...over,
});
const REVIEWED_AT = '2026-10-05T18:28:00.000Z';

describe('curadoria confirmada (data/exercise-media-curation.json)', () => {
  it('tem os 51 vínculos: 22 aprovados e 29 recusados com motivo', () => {
    const { entries } = realCuration();
    expect(entries).toHaveLength(51);
    expect(entries.filter((e) => e.status === 'approved')).toHaveLength(22);
    const refused = entries.filter((e) => e.status === 'rejected');
    expect(refused).toHaveLength(29);
    expect(refused.every((e) => e.rejectionReason && !e.isPrimary)).toBe(true);
  });

  it('20 exercícios com exatamente uma mídia principal; panturrilha com as duas variações aprovadas', () => {
    const { entries } = realCuration();
    const primaries = entries.filter((e) => e.isPrimary);
    expect(primaries).toHaveLength(20);
    expect(new Set(primaries.map((e) => e.exerciseName)).size).toBe(20);
    const calf = entries.filter((e) => e.exerciseName === 'Panturrilha em pé' && e.status === 'approved');
    expect(calf.map((e) => [e.sourceFileName, e.isPrimary, e.sortOrder])).toEqual([
      ['Lever-Standing-Calf-Raise_Calf-FIX__converted.gif', true, 0],
      ['Smith-Standing-Leg-Calf-Raise_Calves__converted.gif', false, 1],
      ['Barbell-Standing-Leg-Calf-Raise_Calves_converted.gif', false, 2],
    ]);
  });
});

describe('validateCuration', () => {
  const file = (entries: CurationEntry[]) => ({ reviewedAt: REVIEWED_AT, entries });

  it('aceita uma principal aprovada e uma recusada com motivo', () => {
    expect(validateCuration(file([approved(), rejected()])).entries).toHaveLength(2);
  });

  it('recusa exercício com duas principais ou sem principal', () => {
    expect(() => validateCuration(file([approved(), approved({ storageKey: 'k2', sha256: sha('c') })]))).toThrow(/exatamente uma mídia principal/);
    expect(() => validateCuration(file([approved({ isPrimary: false })]))).toThrow(/exatamente uma mídia principal/);
  });

  it('recusada precisa de motivo e não pode ser principal', () => {
    expect(() => validateCuration(file([approved(), rejected({ rejectionReason: ' ' })]))).toThrow(/sem rejectionReason/);
    expect(() => validateCuration(file([approved(), rejected({ isPrimary: true })]))).toThrow(/não pode ser principal/);
  });

  it('recusa sha256 inválido, chave repetida, sexo/vista fora do enum e data inválida', () => {
    expect(() => validateCuration(file([approved({ sha256: 'xyz' })]))).toThrow(/sha256 inválido/);
    expect(() => validateCuration(file([approved(), rejected({ storageKey: approved().storageKey })]))).toThrow(/storageKey repetida/);
    expect(() => validateCuration(file([approved({ sex: 'homem' as never })]))).toThrow(/sex inválido/);
    expect(() => validateCuration(file([approved({ view: 'cima' as never })]))).toThrow(/view inválida/);
    expect(() => validateCuration({ reviewedAt: 'ontem', entries: [approved()] })).toThrow(/reviewedAt/);
  });
});

describe('applyExerciseMediaCuration', () => {
  const EXERCISE_ID = 'ex-rosca';
  const row = (id: string, storageKey: string, sha256: string, over: Record<string, unknown> = {}) => ({
    id,
    exerciseId: EXERCISE_ID,
    storageKey,
    sha256,
    contentType: 'image/gif',
    sizeBytes: 10,
    curationStatus: 'pending',
    isPrimary: false,
    sortOrder: 0,
    sex: 'unspecified',
    view: 'unspecified',
    equipment: null,
    variation: null,
    sourceFileName: null,
    reviewedAt: null,
    rejectionReason: null,
    ...over,
  });
  const fakePrisma = (media: ReturnType<typeof row>[]) => {
    const update = jest.fn((args: unknown) => args);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'system' }) },
      exercise: { findMany: jest.fn().mockResolvedValue([{ id: EXERCISE_ID, name: 'Rosca direta' }]) },
      exerciseMedia: { findMany: jest.fn().mockResolvedValue(media), update },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { prisma, update };
  };
  const curation = (entries = [approved(), rejected()]): CurationFile => ({ reviewedAt: REVIEWED_AT, entries });

  it('grava só os campos de curadoria, numa transação, sem tocar chave, sha256 ou exercício', async () => {
    const { prisma, update } = fakePrisma([row('m1', approved().storageKey, sha('a')), row('m2', rejected().storageKey, sha('b'))]);
    const summary = await applyExerciseMediaCuration(prisma as never, curation(), { dryRun: false });
    expect(summary).toMatchObject({ updated: 2, unchanged: 0, approved: 1, rejected: 1, problems: [] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        curationStatus: 'approved',
        isPrimary: true,
        sortOrder: 0,
        sex: 'male',
        view: 'front',
        equipment: 'barra reta',
        variation: 'pegada supinada',
        sourceFileName: 'a.gif',
        reviewedAt: new Date(REVIEWED_AT),
        rejectionReason: null,
      },
    });
    const rejectedData = (update.mock.calls[1][0] as { data: Record<string, unknown> }).data;
    expect(rejectedData).toMatchObject({ curationStatus: 'rejected', isPrimary: false, rejectionReason: rejected().rejectionReason });
    for (const call of update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      for (const field of ['storageKey', 'sha256', 'exerciseId', 'sizeBytes']) expect(data).not.toHaveProperty(field);
    }
  });

  it('dry-run só relata', async () => {
    const { prisma } = fakePrisma([row('m1', approved().storageKey, sha('a')), row('m2', rejected().storageKey, sha('b'))]);
    const summary = await applyExerciseMediaCuration(prisma as never, curation(), { dryRun: true });
    expect(summary.updated).toBe(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tudo ou nada: mídia ausente ou com sha256 diferente impede qualquer gravação', async () => {
    const missing = fakePrisma([row('m1', approved().storageKey, sha('a'))]);
    const a = await applyExerciseMediaCuration(missing.prisma as never, curation(), { dryRun: false });
    expect(a.problems).toEqual([expect.stringMatching(/mídia não vinculada/)]);
    expect(missing.prisma.$transaction).not.toHaveBeenCalled();

    const otherSha = fakePrisma([row('m1', approved().storageKey, sha('a')), row('m2', rejected().storageKey, sha('f'))]);
    const b = await applyExerciseMediaCuration(otherSha.prisma as never, curation(), { dryRun: false });
    expect(b.problems).toEqual([expect.stringMatching(/sha256 do banco difere/)]);
    expect(otherSha.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('é idempotente e não toca mídia fora da curadoria (mas barra uma segunda principal)', async () => {
    const done = {
      curationStatus: 'approved', isPrimary: true, sortOrder: 0, sex: 'male', view: 'front', equipment: 'barra reta',
      variation: 'pegada supinada', sourceFileName: 'a.gif', reviewedAt: new Date(REVIEWED_AT), rejectionReason: null,
    };
    const again = fakePrisma([row('m1', approved().storageKey, sha('a'), done), row('m9', 'exercises/outra.gif', sha('9'))]);
    const summary = await applyExerciseMediaCuration(again.prisma as never, curation([approved()]), { dryRun: false });
    expect(summary).toMatchObject({ updated: 0, unchanged: 1, untouchedOtherMedia: 1, problems: [] });
    expect(again.update).not.toHaveBeenCalled();

    const twoPrimaries = fakePrisma([row('m1', approved().storageKey, sha('a')), row('m9', 'exercises/outra.gif', sha('9'), { isPrimary: true })]);
    const blocked = await applyExerciseMediaCuration(twoPrimaries.prisma as never, curation([approved()]), { dryRun: false });
    expect(blocked.problems).toEqual([expect.stringMatching(/outra mídia já é principal/)]);
    expect(twoPrimaries.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('parseCurationRunOptions (ambiente explícito)', () => {
  const LOCAL = 'postgresql://usuario:senha-secreta@localhost:5432/bocado_dev?schema=public';

  it('sem --apply é sempre dry-run (mesmo sem nenhum argumento)', () => {
    expect(parseCurationRunOptions([], LOCAL)).toEqual({ dryRun: true, target: 'localhost:5432/bocado_dev' });
    expect(parseCurationRunOptions(['--dry-run'], LOCAL).dryRun).toBe(true);
  });

  it('--apply exige --expect-target igual ao banco do DATABASE_URL', () => {
    expect(() => parseCurationRunOptions(['--apply'], LOCAL)).toThrow(/--expect-target=localhost:5432\/bocado_dev/);
    expect(() => parseCurationRunOptions(['--apply', '--expect-target=localhost:55432/railway'], LOCAL)).toThrow(/Nada foi gravado/);
    expect(() => parseCurationRunOptions(['--apply', '--dry-run', '--expect-target=localhost:5432/bocado_dev'], LOCAL)).toThrow(/não os dois/);
    expect(parseCurationRunOptions(['--apply', '--expect-target=localhost:5432/bocado_dev'], LOCAL)).toEqual({
      dryRun: false,
      target: 'localhost:5432/bocado_dev',
    });
  });

  it('nunca expõe usuário ou senha do DATABASE_URL', () => {
    const messages: string[] = [];
    for (const argv of [[], ['--apply'], ['--apply', '--expect-target=x']]) {
      try {
        messages.push(JSON.stringify(parseCurationRunOptions(argv, LOCAL)));
      } catch (error) {
        messages.push((error as Error).message);
      }
    }
    expect(messages.join(' ')).not.toMatch(/senha-secreta|usuario/);
    expect(() => parseCurationRunOptions([], undefined)).toThrow(/DATABASE_URL não configurado/);
    expect(() => parseCurationRunOptions([], 'nao-e-url')).toThrow(/DATABASE_URL inválido/);
  });
});
