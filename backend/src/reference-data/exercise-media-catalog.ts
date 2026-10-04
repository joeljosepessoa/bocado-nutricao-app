/**
 * Catálogo de GIFs de exercício já enviados ao R2 (bucket privado):
 * inventário → nome normalizado → exercício do catálogo do sistema →
 * manifesto versionável. Funções PURAS (sem banco, sem rede) — o script
 * build-exercise-media-manifest.ts lê/grava os arquivos e o
 * import-exercise-media.ts grava ExerciseMedia só dos matches seguros.
 *
 * O manifesto referencia o exercício pelo NOME do catálogo do sistema
 * (exercises.json), nunca por id: os ids são UUIDs gerados em cada banco
 * (dev ≠ produção) e são resolvidos pelo importador no banco de destino.
 */

export type MatchStatus = 'EXACT' | 'MATCHED' | 'REVIEW' | 'UNMATCHED';
export type MatchConfidence = 'high' | 'low' | 'none';

export const EQUIPMENT_FOLDERS: Readonly<Record<string, string>> = {
  'EXERCÍCIOS COM HALTERES': 'halteres',
  'EXERCÍCIOS COM BARRAS': 'barras',
  'EXERCÍCIOS NA MAQUINA - HACK - BANCO': 'maquinas',
  'EXERCÍCIOS NO CABO  OU POLIA': 'cabo-polia',
  'EXERCÍCIOS NO CABO OU POLIA': 'cabo-polia',
  KETTLEBELL: 'kettlebell',
};

export const STORAGE_KEY_PREFIX = 'exercises/';
export const GIF_CONTENT_TYPE = 'image/gif';

export interface InventoryRow {
  equipmentFolder: string;
  muscleGroupFolder: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface AliasEntry {
  exerciseName: string;
  equipmentFolders: string[];
  aliases: string[];
  reviewWhen: string[][];
}

export interface PilotEntry {
  exerciseName: string;
  sha256: string;
}

export interface ManifestEntry {
  storageKey: string;
  /** derived = montada pela regra do upload (não conferida); r2-listing = conferida na listagem real do bucket. */
  storageKeySource: 'derived' | 'r2-listing';
  fileName: string;
  equipment: string;
  muscleGroup: string;
  normalizedName: string;
  sha256: string;
  sizeBytes: number;
  contentType: typeof GIF_CONTENT_TYPE;
  /** Nome do exercício no catálogo do sistema; o id é resolvido pelo importador. null = sem vínculo. */
  exerciseName: string | null;
  matchStatus: MatchStatus;
  confidence: MatchConfidence;
  reason: string;
  candidates: string[];
}

// --- CSV do inventário ------------------------------------------------------

const CSV_HEADER = ['Equipamento', 'GrupoMuscular', 'NomeArquivo', 'CaminhoRelativo', 'TamanhoMB', 'TamanhoBytes', 'SHA256'];

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Lê o CSV gerado pelo inventário (Export-Csv do PowerShell, UTF-8 com BOM). */
export function parseInventoryCsv(text: string): InventoryRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = parseCsvLine(lines[0] ?? '');
  if (CSV_HEADER.some((name, i) => header[i] !== name)) {
    throw new Error(`Inventário com cabeçalho inesperado — esperado: ${CSV_HEADER.join(',')}.`);
  }
  return lines.slice(1).map((line, index) => {
    const [equipmentFolder, muscleGroupFolder, fileName, relativePath, , sizeBytes, sha256] = parseCsvLine(line);
    const size = Number(sizeBytes);
    if (!fileName?.toLowerCase().endsWith('.gif') || !Number.isInteger(size) || size <= 0 || !/^[0-9a-f]{64}$/i.test(sha256 ?? '')) {
      throw new Error(`Inventário: linha ${index + 2} inválida (arquivo, tamanho ou SHA-256).`);
    }
    return { equipmentFolder, muscleGroupFolder, fileName, relativePath, sizeBytes: size, sha256: sha256.toLowerCase() };
  });
}

// --- Normalização -----------------------------------------------------------

/** "ANTEBRAÇO" → "antebraco"; "OMBROS E TRAPÉZIO" → "ombros-e-trapezio". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function equipmentSlug(folder: string): string {
  const slug = EQUIPMENT_FOLDERS[folder];
  if (!slug) {
    throw new Error(`Pasta de equipamento desconhecida no inventário: "${folder}".`);
  }
  return slug;
}

/**
 * Chave no bucket pela regra do upload (`exercises/<equipamento>/<grupo>/<arquivo>`),
 * com o nome do arquivo intacto. Só uma DEDUÇÃO: o importador nunca grava
 * uma chave sem conferi-la no R2 (HEAD) ou numa listagem real do bucket.
 */
export function deriveStorageKey(row: InventoryRow): string {
  return `${STORAGE_KEY_PREFIX}${equipmentSlug(row.equipmentFolder)}/${slugify(row.muscleGroupFolder)}/${row.fileName}`;
}

// Qualificadores que só mudam a APRESENTAÇÃO do vídeo (modelo, ângulo, versão).
const PRESENTATION = /^(male|female|side pov|back pov|front pov|pov|side view|front view|back view|version \d+|version|versio|versi|fix\d*|\d+)$/;
// Restos de qualificador truncado no fim do nome do arquivo ("...-without-rack-fe").
const TRAILING_NOISE = new Set(['male', 'female', 'fe', 'fem', 'fema', 'femal', 'ma', 'mal', 'version', 'versio', 'versi', 'vers', 'ver']);
const TYPOS: Readonly<Record<string, string>> = { dumbell: 'dumbbell', sigle: 'single', elevanted: 'elevated', gobelt: 'goblet' };

/**
 * Nome do arquivo → nome do exercício em minúsculas, sem a etiqueta de parte
 * do corpo (`_Thighs-FIX`), sem `_converted` e sem qualificadores de
 * apresentação. Qualificadores que mudam o EXERCÍCIO ("with rope attachment",
 * "without rack") são mantidos.
 */
export function normalizeGifName(fileName: string): string {
  const segments = fileName
    .replace(/\.gif$/i, '')
    .replace(/_+converted$/i, '')
    .split('_')
    .filter(Boolean);
  // segments[1] é a etiqueta de parte do corpo ("Thighs-FIX"); o que vem depois
  // dela muda o que o vídeo mostra ("without-weight") e entra no nome.
  const extras = segments
    .slice(2)
    .map((segment) => segment.replace(/[-]+/g, ' ').trim().toLowerCase())
    .filter((segment) => !PRESENTATION.test(segment));
  let name = [segments[0] ?? '', ...extras].join(' ');
  name = name.replace(/\(([^)]*)\)?/g, (_match, inner: string) => {
    const words = inner.replace(/[-_]+/g, ' ').trim().toLowerCase();
    return PRESENTATION.test(words) ? ' ' : ` ${words} `;
  });
  const tokens = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((token) => TYPOS[token] ?? token);
  while (tokens.length > 1 && TRAILING_NOISE.has(tokens[tokens.length - 1])) tokens.pop();
  // "version 3" solto (sem parênteses) no meio ou no fim.
  return tokens
    .join(' ')
    .replace(/\bversion \d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Matching ---------------------------------------------------------------

export interface MatchContext {
  aliases: AliasEntry[];
  /** sha256 → exercício: GIFs já revisados e aprovados no piloto (exercise-media-pilot.json). */
  pilotBySha: Map<string, string>;
  catalogNames: Set<string>;
}

/** Valida a tabela de aliases contra o catálogo: nome existente, alias único, regras de revisão com 2+ palavras. */
export function buildMatchContext(aliases: AliasEntry[], pilot: PilotEntry[], catalogNames: string[]): MatchContext {
  const catalog = new Set(catalogNames);
  const seenAlias = new Map<string, string>();
  for (const entry of aliases) {
    if (!catalog.has(entry.exerciseName)) {
      throw new Error(`Alias aponta para exercício fora do catálogo: "${entry.exerciseName}".`);
    }
    for (const alias of entry.aliases) {
      const owner = seenAlias.get(alias);
      if (owner && owner !== entry.exerciseName) {
        throw new Error(`Alias "${alias}" ambíguo: ${owner} e ${entry.exerciseName}.`);
      }
      seenAlias.set(alias, entry.exerciseName);
    }
    for (const rule of entry.reviewWhen) {
      if (rule.length < 2) {
        // Uma palavra só ("press", "curl", "row"...) nunca basta para sugerir um exercício.
        throw new Error(`Regra de revisão de "${entry.exerciseName}" precisa de 2+ palavras: [${rule.join(', ')}].`);
      }
    }
  }
  const pilotBySha = new Map<string, string>();
  for (const entry of pilot) {
    if (!catalog.has(entry.exerciseName)) {
      throw new Error(`Piloto aponta para exercício fora do catálogo: "${entry.exerciseName}".`);
    }
    pilotBySha.set(entry.sha256.toLowerCase(), entry.exerciseName);
  }
  return { aliases, pilotBySha, catalogNames: catalog };
}

export interface MatchResult {
  exerciseName: string | null;
  matchStatus: MatchStatus;
  confidence: MatchConfidence;
  reason: string;
  candidates: string[];
}

export function matchGif(row: InventoryRow, normalizedName: string, context: MatchContext): MatchResult {
  const equipment = equipmentSlug(row.equipmentFolder);

  const pilotExercise = context.pilotBySha.get(row.sha256);
  if (pilotExercise) {
    return {
      exerciseName: pilotExercise,
      matchStatus: 'EXACT',
      confidence: 'high',
      reason: 'sha256 idêntico ao GIF já revisado e aprovado no piloto',
      candidates: [],
    };
  }

  const aliasOwner = context.aliases.find((entry) => entry.aliases.includes(normalizedName));
  if (aliasOwner) {
    if (aliasOwner.equipmentFolders.includes(equipment)) {
      return {
        exerciseName: aliasOwner.exerciseName,
        matchStatus: 'MATCHED',
        confidence: 'high',
        reason: `alias curado "${normalizedName}"`,
        candidates: [],
      };
    }
    return {
      exerciseName: null,
      matchStatus: 'REVIEW',
      confidence: 'low',
      reason: `alias "${normalizedName}" em pasta de equipamento incompatível (${equipment})`,
      candidates: [aliasOwner.exerciseName],
    };
  }

  const tokens = new Set(normalizedName.split(' '));
  const candidates = context.aliases
    .filter((entry) => entry.reviewWhen.some((rule) => rule.every((word) => tokens.has(word))))
    .map((entry) => entry.exerciseName);
  if (candidates.length > 0) {
    return {
      exerciseName: null,
      matchStatus: 'REVIEW',
      confidence: 'low',
      reason: candidates.length > 1 ? 'mais de um exercício possível' : 'variação/parente de um exercício do catálogo — confirmar',
      candidates,
    };
  }

  return { exerciseName: null, matchStatus: 'UNMATCHED', confidence: 'none', reason: 'sem exercício correspondente no catálogo', candidates: [] };
}

// --- Listagem real do bucket (opcional) -------------------------------------

/**
 * Lê a saída de `aws s3 ls s3://<bucket>/exercises/ --recursive` (data, hora,
 * tamanho, chave). Só chaves e tamanhos — nenhuma credencial passa por aqui.
 */
export function parseBucketListing(text: string): Map<string, { storageKey: string; sizeBytes: number }> {
  const byFileName = new Map<string, { storageKey: string; sizeBytes: number }>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\S+\s+\S+\s+(\d+)\s+(exercises\/.+\.gif)\s*$/i.exec(line.trim());
    if (!match) continue;
    const storageKey = match[2];
    byFileName.set(storageKey.slice(storageKey.lastIndexOf('/') + 1), { storageKey, sizeBytes: Number(match[1]) });
  }
  return byFileName;
}

// --- Manifesto e relatório --------------------------------------------------

export function buildManifest(
  rows: InventoryRow[],
  context: MatchContext,
  listing?: Map<string, { storageKey: string; sizeBytes: number }>,
): ManifestEntry[] {
  return rows.map((row) => {
    const normalizedName = normalizeGifName(row.fileName);
    const listed = listing?.get(row.fileName);
    const fromListing = listed && listed.sizeBytes === row.sizeBytes ? listed : undefined;
    return {
      storageKey: fromListing?.storageKey ?? deriveStorageKey(row),
      storageKeySource: fromListing ? 'r2-listing' : 'derived',
      fileName: row.fileName,
      equipment: equipmentSlug(row.equipmentFolder),
      muscleGroup: slugify(row.muscleGroupFolder),
      normalizedName,
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      contentType: GIF_CONTENT_TYPE,
      ...matchGif(row, normalizedName, context),
    };
  });
}

export interface MatchReport {
  totalGifs: number;
  byStatus: Record<MatchStatus, number>;
  storageKeys: { derived: number; verifiedByListing: number };
  catalogExercises: number;
  exercisesWithGif: { exerciseName: string; gifs: number }[];
  exercisesWithoutGif: string[];
  gifsWithoutExercise: number;
  exercisesWithMultipleGifs: { exerciseName: string; gifs: number }[];
  duplicateContent: { sha256: string; files: string[] }[];
  muscleGroupFolders: Record<string, number>;
  reviewCandidates: { exerciseName: string; gifs: number }[];
  topReviewNames: { normalizedName: string; count: number; candidates: string[] }[];
  topUnmatchedNames: { normalizedName: string; count: number }[];
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

const sortedCounts = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export function buildReport(manifest: ManifestEntry[], catalogNames: string[]): MatchReport {
  const linked = manifest.filter((entry) => entry.exerciseName && (entry.matchStatus === 'EXACT' || entry.matchStatus === 'MATCHED'));
  const perExercise = countBy(linked, (entry) => entry.exerciseName!);
  const review = manifest.filter((entry) => entry.matchStatus === 'REVIEW');
  const unmatched = manifest.filter((entry) => entry.matchStatus === 'UNMATCHED');
  const bySha = new Map<string, string[]>();
  for (const entry of manifest) bySha.set(entry.sha256, [...(bySha.get(entry.sha256) ?? []), entry.storageKey]);

  const reviewNames = new Map<string, { count: number; candidates: string[] }>();
  for (const entry of review) {
    const current = reviewNames.get(entry.normalizedName);
    reviewNames.set(entry.normalizedName, { count: (current?.count ?? 0) + 1, candidates: entry.candidates });
  }

  return {
    totalGifs: manifest.length,
    byStatus: {
      EXACT: manifest.filter((entry) => entry.matchStatus === 'EXACT').length,
      MATCHED: manifest.filter((entry) => entry.matchStatus === 'MATCHED').length,
      REVIEW: review.length,
      UNMATCHED: unmatched.length,
    },
    storageKeys: {
      derived: manifest.filter((entry) => entry.storageKeySource === 'derived').length,
      verifiedByListing: manifest.filter((entry) => entry.storageKeySource === 'r2-listing').length,
    },
    catalogExercises: catalogNames.length,
    exercisesWithGif: sortedCounts(perExercise).map(([exerciseName, gifs]) => ({ exerciseName, gifs })),
    exercisesWithoutGif: catalogNames.filter((name) => !perExercise.has(name)),
    gifsWithoutExercise: review.length + unmatched.length,
    exercisesWithMultipleGifs: sortedCounts(perExercise)
      .filter(([, gifs]) => gifs > 1)
      .map(([exerciseName, gifs]) => ({ exerciseName, gifs })),
    duplicateContent: [...bySha.entries()].filter(([, files]) => files.length > 1).map(([sha256, files]) => ({ sha256, files })),
    muscleGroupFolders: Object.fromEntries(sortedCounts(countBy(manifest, (entry) => `${entry.equipment}/${entry.muscleGroup}`))),
    reviewCandidates: sortedCounts(countBy(review.flatMap((entry) => entry.candidates), (name) => name)).map(([exerciseName, gifs]) => ({
      exerciseName,
      gifs,
    })),
    topReviewNames: [...reviewNames.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, 60)
      .map(([normalizedName, value]) => ({ normalizedName, ...value })),
    topUnmatchedNames: sortedCounts(countBy(unmatched, (entry) => entry.normalizedName))
      .slice(0, 60)
      .map(([normalizedName, count]) => ({ normalizedName, count })),
  };
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Planilha de revisão: só REVIEW e UNMATCHED, para decisão humana. */
export function buildReviewCsv(manifest: ManifestEntry[]): string {
  const header = ['matchStatus', 'equipment', 'muscleGroup', 'normalizedName', 'candidates', 'reason', 'fileName', 'storageKey', 'sha256'];
  const lines = manifest
    .filter((entry) => entry.matchStatus === 'REVIEW' || entry.matchStatus === 'UNMATCHED')
    .map((entry) =>
      [
        entry.matchStatus,
        entry.equipment,
        entry.muscleGroup,
        entry.normalizedName,
        entry.candidates.join(' | '),
        entry.reason,
        entry.fileName,
        entry.storageKey,
        entry.sha256,
      ]
        .map(csvField)
        .join(','),
    );
  return `${[header.join(','), ...lines].join('\n')}\n`;
}

// --- Validação do manifesto (usada pelo importador) -------------------------

const SAFE_KEY = /^exercises\/[a-z0-9-]+\/[a-z0-9-]+\/[^/\\?#]+\.gif$/i;
const STATUSES: MatchStatus[] = ['EXACT', 'MATCHED', 'REVIEW', 'UNMATCHED'];

/**
 * Recusa o manifesto inteiro se algum registro estiver malformado: chave fora
 * de `exercises/...gif`, URL (inclusive pré-assinada) no lugar da chave,
 * sha256/tamanho inválidos, ou match seguro sem exercício.
 */
export function validateManifest(data: unknown): ManifestEntry[] {
  if (!Array.isArray(data)) {
    throw new Error('Manifesto inválido: esperado um array de registros.');
  }
  data.forEach((raw, index) => {
    const entry = raw as Partial<ManifestEntry>;
    const where = `Manifesto inválido no registro ${index}`;
    if (typeof entry.storageKey !== 'string' || /^[a-z]+:\/\//i.test(entry.storageKey) || /x-amz-/i.test(entry.storageKey) || !SAFE_KEY.test(entry.storageKey)) {
      throw new Error(`${where}: storageKey precisa ser uma chave exercises/<equipamento>/<grupo>/<arquivo>.gif, nunca URL.`);
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error(`${where}: sha256 inválido.`);
    }
    if (!Number.isInteger(entry.sizeBytes) || (entry.sizeBytes as number) <= 0) {
      throw new Error(`${where}: sizeBytes inválido.`);
    }
    if (entry.contentType !== GIF_CONTENT_TYPE) {
      throw new Error(`${where}: contentType deve ser ${GIF_CONTENT_TYPE}.`);
    }
    if (!STATUSES.includes(entry.matchStatus as MatchStatus)) {
      throw new Error(`${where}: matchStatus inválido.`);
    }
    const safe = entry.matchStatus === 'EXACT' || entry.matchStatus === 'MATCHED';
    if (safe && (typeof entry.exerciseName !== 'string' || entry.exerciseName.trim() === '')) {
      throw new Error(`${where}: ${entry.matchStatus} sem exerciseName.`);
    }
    if (!safe && entry.exerciseName !== null) {
      throw new Error(`${where}: ${entry.matchStatus} não pode ter exerciseName (vínculo só em EXACT/MATCHED).`);
    }
    if (entry.storageKeySource !== 'derived' && entry.storageKeySource !== 'r2-listing') {
      throw new Error(`${where}: storageKeySource inválido.`);
    }
  });
  return data as ManifestEntry[];
}
