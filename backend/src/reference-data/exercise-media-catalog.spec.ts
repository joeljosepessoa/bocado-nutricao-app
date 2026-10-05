import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AliasEntry,
  buildManifest,
  buildMatchContext,
  buildReport,
  buildReviewCsv,
  decodeTextFile,
  deriveStorageKey,
  InventoryRow,
  ManifestEntry,
  matchGif,
  normalizeGifName,
  parseBucketListing,
  parseInventoryCsv,
  slugify,
  validateManifest,
} from './exercise-media-catalog';

const SHA = (char: string) => char.repeat(64);
const row = (overrides: Partial<InventoryRow> = {}): InventoryRow => ({
  equipmentFolder: 'EXERCÍCIOS COM BARRAS',
  muscleGroupFolder: 'PERNA',
  fileName: 'Barbell-Full-Squat_Thighs-FIX__converted.gif',
  relativePath: 'x',
  sizeBytes: 100,
  sha256: SHA('a'),
  ...overrides,
});

const CATALOG = ['Agachamento livre', 'Rosca direta', 'Supino reto com barra', 'Desenvolvimento militar'];
const ALIASES: AliasEntry[] = [
  { exerciseName: 'Agachamento livre', equipmentFolders: ['barras'], aliases: ['barbell full squat'], reviewWhen: [['barbell', 'squat']] },
  { exerciseName: 'Rosca direta', equipmentFolders: ['barras'], aliases: ['barbell curl'], reviewWhen: [['barbell', 'curl']] },
  { exerciseName: 'Supino reto com barra', equipmentFolders: ['barras'], aliases: ['barbell bench press'], reviewWhen: [['barbell', 'bench', 'press']] },
  { exerciseName: 'Desenvolvimento militar', equipmentFolders: ['barras'], aliases: [], reviewWhen: [['military', 'press'], ['barbell', 'press']] },
];
const context = () => buildMatchContext(ALIASES, [{ exerciseName: 'Rosca direta', sha256: SHA('p') }], CATALOG);
const match = (r: InventoryRow) => matchGif(r, normalizeGifName(r.fileName), context());

describe('normalizeGifName', () => {
  it.each([
    ['Barbell-Full-Squat-(Side-POV)_Thighs-FIX__converted.gif', 'barbell full squat'],
    ['Barbell-Deadlift-(side-POV)-(male)_Hips__converted.gif', 'barbell deadlift'],
    ['Lever-Seated-Leg-Extension-(VERSION-2)_Thighs__converted.gif', 'lever seated leg extension'],
    ['Dumbbell-Russian-Twist-with-Legs-Floor-Off-(VERSIO_converted.gif', 'dumbbell russian twist with legs floor off'],
    ['Barbell-Standing-Military-Press-(without-rack)-(fe_converted.gif', 'barbell standing military press without rack'],
    ['Cable-Pushdown-(with-rope-attachment)_Upper-Arms-FIX__converted.gif', 'cable pushdown with rope attachment'],
    ['Lever-Shoulder-Press-Plate-Loaded-VERSION-3_Shoulders_converted.gif', 'lever shoulder press plate loaded'],
    ['Dumbell-Sigle-Arm-Row_Back_converted.gif', 'dumbbell single arm row'],
  ])('%s → "%s" (só apresentação sai; o que muda o exercício fica)', (file, expected) => {
    expect(normalizeGifName(file)).toBe(expected);
  });

  it('sufixo depois da etiqueta de parte do corpo entra no nome ("sem carga" é outro vídeo)', () => {
    expect(normalizeGifName('Barbell-Curl_Upper-Arms_without-weight_converted.gif')).toBe('barbell curl without weight');
  });
});

describe('chave no bucket e slug', () => {
  it('deduz exercises/<equipamento>/<grupo>/<arquivo> com o nome do arquivo intacto', () => {
    expect(slugify('ANTEBRAÇO')).toBe('antebraco');
    expect(slugify('TRAPÉZIO')).toBe('trapezio');
    expect(deriveStorageKey(row({ equipmentFolder: 'EXERCÍCIOS NO CABO  OU POLIA', muscleGroupFolder: 'TRAPÉZIO', fileName: 'Cable-Shrug_(x).gif' }))).toBe(
      'exercises/cabo-polia/trapezio/Cable-Shrug_(x).gif',
    );
  });

  it('pasta de equipamento desconhecida é erro (nunca inventa chave)', () => {
    expect(() => deriveStorageKey(row({ equipmentFolder: 'ELÁSTICOS' }))).toThrow(/desconhecida/);
  });
});

describe('matchGif — níveis de confiança', () => {
  it('EXACT: mesmo sha256 do GIF já aprovado no piloto, independente do nome', () => {
    expect(match(row({ fileName: 'Qualquer-Nome_Arms.gif', sha256: SHA('p') }))).toMatchObject({
      matchStatus: 'EXACT',
      exerciseName: 'Rosca direta',
      confidence: 'high',
    });
  });

  it('MATCHED: alias curado + pasta de equipamento compatível', () => {
    expect(match(row({ fileName: 'Barbell-Full-Squat-(female)_Thighs_converted.gif' }))).toMatchObject({
      matchStatus: 'MATCHED',
      exerciseName: 'Agachamento livre',
      reason: 'alias curado "barbell full squat"',
    });
  });

  it('REVIEW: alias certo em pasta de equipamento incompatível', () => {
    expect(match(row({ equipmentFolder: 'KETTLEBELL', fileName: 'Barbell-Full-Squat_Thighs.gif' }))).toMatchObject({
      matchStatus: 'REVIEW',
      exerciseName: null,
      candidates: ['Agachamento livre'],
    });
  });

  it('REVIEW: variação do exercício (front squat ≠ agachamento livre) nunca vira vínculo automático', () => {
    expect(match(row({ fileName: 'Barbell-Front-Squat_Thighs.gif' }))).toMatchObject({ matchStatus: 'REVIEW', exerciseName: null, candidates: ['Agachamento livre'] });
  });

  it('REVIEW: mais de um exercício possível lista todos os candidatos', () => {
    const result = match(row({ fileName: 'Barbell-Military-Bench-Press_Chest.gif' }));
    expect(result.matchStatus).toBe('REVIEW');
    expect(result.candidates).toEqual(['Supino reto com barra', 'Desenvolvimento militar']);
    expect(result.reason).toMatch(/mais de um/);
  });

  it('UNMATCHED: sem exercício correspondente', () => {
    expect(match(row({ fileName: 'Cable-Woodchopper_Waist.gif' }))).toMatchObject({ matchStatus: 'UNMATCHED', exerciseName: null, confidence: 'none' });
  });

  it('recusa da revisão humana vence até o EXACT do piloto: vira REVIEW marcado, sem vínculo', () => {
    const ctx = buildMatchContext(ALIASES, [{ exerciseName: 'Rosca direta', sha256: SHA('e') }], CATALOG, [
      { sha256: SHA('e'), exerciseName: 'Rosca direta', reason: 'mostra outro movimento' },
    ]);
    const r = row({ fileName: 'Barbell-Curl_Arms.gif', sha256: SHA('e') });
    expect(matchGif(r, normalizeGifName(r.fileName), ctx)).toEqual({
      exerciseName: null,
      matchStatus: 'REVIEW',
      confidence: 'low',
      reason: 'recusado na revisão humana para "Rosca direta": mostra outro movimento',
      candidates: ['Rosca direta'],
      rejectedByReview: true,
    });
  });

  it('uma palavra genérica sozinha ("curl", "press") nunca sugere exercício', () => {
    expect(match(row({ fileName: 'Lever-Curl_Arms.gif' })).matchStatus).toBe('UNMATCHED');
    expect(match(row({ fileName: 'Cable-Press_Chest.gif' })).matchStatus).toBe('UNMATCHED');
  });
});

describe('buildMatchContext — a tabela de aliases é validada', () => {
  it('recusa alias para exercício fora do catálogo, alias ambíguo e regra de revisão de uma palavra', () => {
    expect(() => buildMatchContext([{ ...ALIASES[0], exerciseName: 'Inventado' }], [], CATALOG)).toThrow(/fora do catálogo/);
    expect(() => buildMatchContext([ALIASES[0], { ...ALIASES[1], aliases: ['barbell full squat'] }], [], CATALOG)).toThrow(/ambíguo/);
    expect(() => buildMatchContext([{ ...ALIASES[1], reviewWhen: [['curl']] }], [], CATALOG)).toThrow(/2\+ palavras/);
    expect(() => buildMatchContext(ALIASES, [{ exerciseName: 'Inventado', sha256: SHA('p') }], CATALOG)).toThrow(/Piloto/);
    expect(() => buildMatchContext(ALIASES, [], CATALOG, [{ sha256: SHA('e'), exerciseName: 'Inventado', reason: 'x' }])).toThrow(/Recusa/);
    expect(() => buildMatchContext(ALIASES, [], CATALOG, [{ sha256: 'abc', exerciseName: 'Rosca direta', reason: 'x' }])).toThrow(/sha256/);
    expect(() => buildMatchContext(ALIASES, [], CATALOG, [{ sha256: SHA('e'), exerciseName: 'Rosca direta', reason: ' ' }])).toThrow(/motivo/);
  });

  it('a tabela real de aliases é coerente com o catálogo real', () => {
    const data = (file: string) => JSON.parse(readFileSync(join(__dirname, 'data', file), 'utf-8'));
    expect(() =>
      buildMatchContext(
        data('exercise-media-aliases.json').exercises,
        data('exercise-media-pilot.json'),
        data('exercises.json').map((e: { name: string }) => e.name),
        data('exercise-media-aliases.json').rejected,
      ),
    ).not.toThrow();
  });
});

describe('inventário, listagem do bucket, manifesto e relatório', () => {
  const csv = [
    '﻿"Equipamento","GrupoMuscular","NomeArquivo","CaminhoRelativo","TamanhoMB","TamanhoBytes","SHA256"',
    `"EXERCÍCIOS COM BARRAS","PERNA","Barbell-Full-Squat_Thighs.gif","x","0,1","100","${SHA('A')}"`,
    `"EXERCÍCIOS COM BARRAS","PERNA","Barbell-Full-Squat-(female)_Thighs.gif","x","0,1","100","${SHA('A')}"`,
    `"EXERCÍCIOS COM BARRAS","BICEPS","Barbell-Preacher-Curl_Arms.gif","x","0,1","200","${SHA('b')}"`,
    `"KETTLEBELL","OMBRO","Kettlebell-Halo_Shoulders.gif","x","0,1","300","${SHA('c')}"`,
  ].join('\r\n');

  it('lê o CSV do inventário (BOM, CRLF, sha em minúsculas)', () => {
    const rows = parseInventoryCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ equipmentFolder: 'EXERCÍCIOS COM BARRAS', sizeBytes: 100, sha256: SHA('a') });
  });

  it('recusa inventário com cabeçalho ou linha inválidos', () => {
    expect(() => parseInventoryCsv('"a","b"\n"1","2"')).toThrow(/cabeçalho/);
    expect(() => parseInventoryCsv(csv.replace(SHA('b'), 'nao-e-sha'))).toThrow(/linha 4/);
  });

  it('lê a listagem salva em UTF-16 pelo PowerShell (e UTF-8 com/sem BOM)', () => {
    const line = '2026-10-02 11:35:15    100 exercises/barras/perna/Barbell-Full-Squat_Thighs.gif\r\n';
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(line, 'utf16le')]);
    for (const buffer of [utf16, Buffer.from(`﻿${line}`, 'utf-8'), Buffer.from(line, 'utf-8')]) {
      expect(parseBucketListing(decodeTextFile(buffer)).objects).toEqual([
        { storageKey: 'exercises/barras/perna/Barbell-Full-Squat_Thighs.gif', sizeBytes: 100 },
      ]);
    }
  });

  it('com listagem: vínculo seguro só continua EXACT/MATCHED com a chave confirmada; senão vira REVIEW com o motivo', () => {
    const listing = parseBucketListing(
      [
        // primeiro arquivo: tamanho diferente do inventário
        '2026-10-01 20:40:12        999 exercises/barras/perna/Barbell-Full-Squat_Thighs.gif',
        // segundo: confirmado
        '2026-10-01 20:40:12        100 exercises/barras/perna/Barbell-Full-Squat-(female)_Thighs.gif',
        // objeto do bucket fora do inventário
        '2026-10-01 20:40:12         50 exercises/barras/perna/Extra.gif',
      ].join('\n'),
    );
    const manifest = buildManifest(parseInventoryCsv(csv), context(), listing);
    expect(manifest[0]).toMatchObject({
      matchStatus: 'REVIEW',
      exerciseName: null,
      r2Check: 'size-mismatch',
      candidates: ['Agachamento livre'],
      unconfirmedMatch: { status: 'MATCHED', exerciseName: 'Agachamento livre' },
      storageKeySource: 'derived',
    });
    expect(manifest[1]).toMatchObject({ matchStatus: 'MATCHED', r2Check: 'confirmed', storageKeySource: 'r2-listing' });
    expect(manifest[3]).toMatchObject({ matchStatus: 'UNMATCHED', r2Check: 'missing' });
    expect(() => validateManifest(manifest)).not.toThrow();

    const report = buildReport(manifest, CATALOG, listing).r2Listing!;
    expect(report).toMatchObject({ objectsInBucket: 3, inventoryConfirmed: 1, sizeMismatch: ['Barbell-Full-Squat_Thighs.gif'] });
    expect(report.missingInBucket).toEqual(['Barbell-Preacher-Curl_Arms.gif', 'Kettlebell-Halo_Shoulders.gif']);
    expect(report.bucketObjectsNotInInventory).toEqual(['exercises/barras/perna/Barbell-Full-Squat_Thighs.gif', 'exercises/barras/perna/Extra.gif']);
    expect(report.safeLinks).toEqual({
      confirmed: 1,
      rejected: [{ fileName: 'Barbell-Full-Squat_Thighs.gif', exerciseName: 'Agachamento livre', status: 'MATCHED', check: 'size-mismatch' }],
    });
  });

  it('mesmo nome de arquivo em duas pastas do bucket é ambíguo — nunca escolhe uma', () => {
    const listing = parseBucketListing(
      [
        '2026-10-01 20:40:12        100 exercises/barras/perna/Barbell-Full-Squat-(female)_Thighs.gif',
        '2026-10-01 20:40:12        100 exercises/maquinas/perna/Barbell-Full-Squat-(female)_Thighs.gif',
      ].join('\n'),
    );
    expect(buildManifest(parseInventoryCsv(csv), context(), listing)[1]).toMatchObject({ matchStatus: 'REVIEW', r2Check: 'ambiguous' });
  });

  it('listagem real do bucket substitui a chave deduzida (mesmo arquivo e tamanho)', () => {
    const listing = parseBucketListing(
      ['2026-10-01 20:40:12        100 exercises/barras/perna/Barbell-Full-Squat_Thighs.gif', '                           PRE exercises/barras/'].join('\n'),
    );
    const manifest = buildManifest(parseInventoryCsv(csv), context(), listing);
    expect(manifest[0]).toMatchObject({ storageKeySource: 'r2-listing', storageKey: 'exercises/barras/perna/Barbell-Full-Squat_Thighs.gif' });
    expect(manifest[1].storageKeySource).toBe('derived');
  });

  it('manifesto: nunca inventa vínculo; relatório conta status, cobertura, múltiplos e duplicados', () => {
    const manifest = buildManifest(parseInventoryCsv(csv), context());
    expect(manifest.map((e) => [e.matchStatus, e.exerciseName])).toEqual([
      ['MATCHED', 'Agachamento livre'],
      ['MATCHED', 'Agachamento livre'],
      ['REVIEW', null],
      ['UNMATCHED', null],
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/https?:|X-Amz/i);

    const report = buildReport(manifest, CATALOG);
    expect(report.byStatus).toEqual({ EXACT: 0, MATCHED: 2, REVIEW: 1, UNMATCHED: 1 });
    expect(report.exercisesWithGif).toEqual([{ exerciseName: 'Agachamento livre', gifs: 2 }]);
    expect(report.exercisesWithoutGif).toEqual(['Rosca direta', 'Supino reto com barra', 'Desenvolvimento militar']);
    expect(report.gifsWithoutExercise).toBe(2);
    expect(report.exercisesWithMultipleGifs).toEqual([{ exerciseName: 'Agachamento livre', gifs: 2 }]);
    expect(report.duplicateContent).toHaveLength(1);

    const review = buildReviewCsv(manifest).trim().split('\n');
    expect(review).toHaveLength(3); // cabeçalho + REVIEW + UNMATCHED
    expect(review[1]).toMatch(/^REVIEW,barras,biceps,barbell preacher curl,Rosca direta,/);
  });
});

describe('validateManifest', () => {
  const valid = (): ManifestEntry => ({
    storageKey: 'exercises/barras/perna/Barbell-Squat_(x).gif',
    storageKeySource: 'derived',
    fileName: 'Barbell-Squat_(x).gif',
    equipment: 'barras',
    muscleGroup: 'perna',
    normalizedName: 'barbell squat',
    sha256: SHA('a'),
    sizeBytes: 10,
    contentType: 'image/gif',
    exerciseName: 'Agachamento livre',
    matchStatus: 'MATCHED',
    confidence: 'high',
    reason: 'alias',
    candidates: [],
  });

  it('aceita registro válido', () => {
    expect(validateManifest([valid()])).toHaveLength(1);
  });

  it.each<[string, Partial<ManifestEntry> | unknown]>([
    ['URL pré-assinada no lugar da chave', { storageKey: 'https://conta.r2.cloudflarestorage.com/b/exercises/barras/perna/a.gif?X-Amz-Signature=1' }],
    ['chave fora de exercises/', { storageKey: 'photos/a.gif' }],
    ['chave com parâmetros', { storageKey: 'exercises/barras/perna/a.gif?X-Amz-Signature=1' }],
    ['sha256 inválido', { sha256: 'abc' }],
    ['tamanho inválido', { sizeBytes: 0 }],
    ['contentType diferente de gif', { contentType: 'image/png' }],
    ['MATCHED sem exercício', { exerciseName: null }],
    ['REVIEW com exercício (vínculo só em EXACT/MATCHED)', { matchStatus: 'REVIEW' }],
    ['status desconhecido', { matchStatus: 'MAYBE' }],
    ['recusado marcado como vínculo seguro', { rejectedByReview: true }],
  ])('recusa o manifesto: %s', (_label, patch) => {
    expect(() => validateManifest([{ ...valid(), ...(patch as object) }])).toThrow(/Manifesto inválido/);
  });

  it('recusa o que não é array', () => {
    expect(() => validateManifest({ entries: [] })).toThrow(/array/);
  });
});
