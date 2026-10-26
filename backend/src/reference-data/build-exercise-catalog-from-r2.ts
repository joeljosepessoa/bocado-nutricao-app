/**
 * Monta o catálogo de exercícios a partir da LISTA de GIFs do bucket R2 (nome do arquivo = nome do
 * exercício; pastas = seção, equipamento e grupo muscular). Não acessa o R2 nem o banco: lê a lista
 * de chaves (JSON gerado por um inventário somente leitura) e grava `data/catalogo_exercicios.json`.
 *
 *   npx ts-node src/reference-data/build-exercise-catalog-from-r2.ts <lista-de-chaves.json>
 *
 * Estrutura do bucket (out/2026): exercises/ACADEMIA/<equipamento>/<grupo>/<nome>.gif,
 * exercises/ACADEMIA/CARDIO/<nome>.gif, exercises/FUNCIONAL/<categoria>[/<subgrupo>]/<nome>.gif e
 * 1.264 GIFs soltos em exercises/FUNCIONAL/<nome>.gif — nesses o grupo vem das palavras do nome.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface CatalogEntry {
  nome: string;
  grupos_musculares: string[];
  equipamento: string | null;
  secao: string;
  tipo: 'strength' | 'cardio' | 'mobility' | 'stretching' | 'bodyweight' | 'other';
  gif_key: string;
  /** Tamanho do GIF no bucket (bytes) e ETag do R2, da lista de chaves. */
  tamanho_bytes: number;
  etag: string | null;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Pasta de grupo (ACADEMIA e subpastas do FUNCIONAL) → grupo muscular exibido. */
const FOLDER_GROUP: Record<string, string> = {
  abdominais: 'Abdômen',
  antebraco: 'Antebraço',
  andebraco: 'Antebraço',
  biceps: 'Bíceps',
  costas: 'Costas',
  ombro: 'Ombros',
  ombros: 'Ombros',
  panturrilha: 'Panturrilha',
  panturrilhas: 'Panturrilha',
  peito: 'Peito',
  perna: 'Pernas',
  trapezio: 'Trapézio',
  triceps: 'Tríceps',
  burpee: 'Cardio',
  'parada de maos': 'Ombros',
};

/** Pasta de equipamento da ACADEMIA. */
const ACADEMIA_EQUIPMENT: Record<string, string> = {
  'exercicios com halteres': 'Halteres',
  'exercicios com barras': 'Barra',
  'exercicios na maquina - hack - banco': 'Máquina',
  'exercicios no cabo ou polia': 'Cabo / polia',
  kettlebell: 'Kettlebell',
  superband: 'Superband',
  cardio: 'Aparelho de cardio',
};

/** Categoria do FUNCIONAL → equipamento, grupo fixo (quando a categoria já diz) e tipo. */
const FUNCIONAL: Record<string, { equipamento?: string; grupo?: string; tipo?: CatalogEntry['tipo'] }> = {
  abdominais: { grupo: 'Abdômen', tipo: 'bodyweight' },
  'agilidade e coordenacao': { grupo: 'Cardio', tipo: 'cardio' },
  alavanca: { equipamento: 'Alavanca' },
  alongamento: { grupo: 'Alongamento', tipo: 'stretching' },
  argolas: { equipamento: 'Argolas' },
  'ativacao neuromuscular': { tipo: 'bodyweight' },
  banco: { equipamento: 'Banco' },
  'bola pilates': { equipamento: 'Bola de pilates' },
  'bosu ball': { equipamento: 'Bosu' },
  cadeira: { equipamento: 'Cadeira' },
  caixote: { equipamento: 'Caixote' },
  cardio: { grupo: 'Cardio', tipo: 'cardio' },
  'corda naval': { equipamento: 'Corda naval', grupo: 'Cardio', tipo: 'cardio' },
  escada: { equipamento: 'Escada de agilidade', grupo: 'Cardio', tipo: 'cardio' },
  'especificos modalidades': {},
  'halteres e barras': { equipamento: 'Halteres / barra' },
  isometria: { tipo: 'bodyweight' },
  'liberacao miofascial': { grupo: 'Liberação miofascial', tipo: 'mobility' },
  'medicine ball': { equipamento: 'Medicine ball' },
  miniband: { equipamento: 'Miniband' },
  mobilidade: { grupo: 'Mobilidade', tipo: 'mobility' },
  parede: { equipamento: 'Parede' },
  peso: { equipamento: 'Peso livre' },
  'peso corporal': { equipamento: 'Peso corporal', tipo: 'bodyweight' },
  pliometria: { tipo: 'bodyweight' },
  propiocepcao: { tipo: 'bodyweight' },
  step: { equipamento: 'Step' },
  steps: { equipamento: 'Step' },
  superband: { equipamento: 'Superband' },
  tracao: { tipo: 'bodyweight' },
  trx: { equipamento: 'TRX' },
  yoga: { grupo: 'Mobilidade', tipo: 'mobility' },
};

/** Subpasta da Liberação miofascial = o objeto usado. */
const MIOFASCIAL_EQUIPMENT: Record<string, string> = { bolinha: 'Bolinha', rolinho: 'Rolo' };

/** Palavras do nome → grupo (para os GIFs sem pasta de grupo). Ordem não importa: pode dar mais de um grupo. */
const KEYWORDS: Array<[RegExp, string]> = [
  [/\b(abdominal|abdomen|prancha|crunch|canivete|obliqu|rotacao russa|hollow|inseto morto|dead bug|elevacao de pernas|tesoura|bicicleta no ar|roll up|v-up|sit ?up|elevacao (dupla )?de joelhos?|l-sit|toque no calcanhar|saca-rolhas|corkscrew)/, 'Abdômen'],
  [/\b(supino|flexao de braco|flexoes|flexao diagonal|crucifixo|peitoral|voador|peck|peito|svend press)/, 'Peito'],
  [/\b(remada|puxada|pulldown|barra fixa|pull ?up|serrote|pullover|chin ?up|aducao escapular|retracao escapular)/, 'Costas'],
  [/\b(lombar|superman|bom dia|good morning|hiperextensao)/, 'Lombar'],
  [/\b(desenvolvimento|elevacao lateral|elevacao frontal|arnold|face pull|crucifixo invertido|ombro|rotacao (externa|interna)|elevacao em [tyw]\b)/, 'Ombros'],
  [/\b(rosca|biceps)/, 'Bíceps'],
  [/\b(triceps|mergulho|testa|frances|paralelas)/, 'Tríceps'],
  [/\b(agachamento|afundo|avanco|passada|leg press|extensora|flexora|stiff|levantamento terra|quadriceps|isquiotibia|posterior de coxa|subida no|step ?up|pistol|flexao de joelho|cadeirinha|extensao (unilateral )?de perna)/, 'Pernas'],
  [/\b(gluteo|ponte|elevacao pelvica|hip thrust|abducao|coice|elevacao (alternada )?de perna para (tras|o lado)|elevacao de perna do lado|chute lateral|concha)/, 'Glúteos'],
  [/\b(panturrilha|gemeos|ponta dos pes)/, 'Panturrilha'],
  [/\b(antebraco|punho)/, 'Antebraço'],
  [/\b(encolhimento|trapezio)/, 'Trapézio'],
  [/\b(corrida|polichinelo|burpee|pular corda|skipping|esteira|bicicleta ergometrica|eliptico|escalador|mountain climber|caminhada|marcha|amarelinha|salto|saltos|pulo|soco|uppercut|jab|chute|joelho alto|boxe|patinador|rastejar)/, 'Cardio'],
  [/\b(alongamento|espacate|cachorro olhando|inclinacao lateral)/, 'Alongamento'],
  [/\b(pescoco|cervical|escaleno|(rotacao|inclinacao|flexao|extensao)( completa)? da cabeca)/, 'Pescoço'],
  [/\b(mobilidade|mobilizacao|rotacao (de (quadril|ombro|tronco)|toracica)|gato-vaca|circulo de|postura (da|do|de|em))/, 'Mobilidade'],
];

function inferGroups(name: string): string[] {
  const n = norm(name);
  const groups = new Set(KEYWORDS.filter(([re]) => re.test(n)).map(([, group]) => group));
  // "Tríceps coice" é tríceps, não glúteo.
  if (groups.has('Tríceps') && !/gluteo/.test(n)) groups.delete('Glúteos');
  return [...groups];
}

const pretty = (folder: string) => folder.replace(/\s{2,}/g, ' ').trim();

export function entryFromKey(key: string, size = 0, etag: string | null = null): CatalogEntry | null {
  const parts = key.split('/');
  if (parts[0] !== 'exercises' || !/\.gif$/i.test(key)) return null;
  const nome = parts[parts.length - 1].replace(/\.gif$/i, '').replace(/\s{2,}/g, ' ').trim();
  const folders = parts.slice(1, -1); // ex.: ['ACADEMIA', 'EXERCÍCIOS COM HALTERES', 'PEITO']
  const secao = folders.map(pretty).join(' / ');
  const [area, second, third] = folders.map((f) => norm(f));
  const keywordGroups = inferGroups(nome);
  let grupos: string[] = [];
  let equipamento: string | null = null;
  let tipo: CatalogEntry['tipo'] = 'strength';

  if (area === 'academia') {
    equipamento = ACADEMIA_EQUIPMENT[second ?? ''] ?? null;
    if (second === 'cardio') {
      grupos = ['Cardio'];
      tipo = 'cardio';
    } else {
      const folderGroup = third ? FOLDER_GROUP[third] : undefined;
      grupos = folderGroup ? [folderGroup] : keywordGroups;
      // Exercício de perna que é claramente de glúteo ganha o grupo Glúteos também.
      if (folderGroup === 'Pernas' && keywordGroups.includes('Glúteos')) grupos.push('Glúteos');
    }
  } else if (area === 'funcional') {
    const category = second && folders.length >= 2 ? FUNCIONAL[second] : undefined;
    if (second && third === undefined && folders.length === 1) {
      // solto em FUNCIONAL: só as palavras do nome
    }
    if (category) {
      equipamento = category.equipamento ?? null;
      tipo = category.tipo ?? 'bodyweight';
      if (second === 'liberacao miofascial' && third) equipamento = MIOFASCIAL_EQUIPMENT[third] ?? null;
      const subGroup = third && second === 'peso corporal' ? FOLDER_GROUP[third] : undefined;
      grupos = subGroup ? [subGroup] : category.grupo ? [category.grupo] : [];
      if (second === 'mobilidade' && third) grupos = ['Mobilidade'];
      // Categoria de equipamento (TRX, caixote…) não diz o músculo: as palavras do nome dizem.
      if (grupos.length === 0 || (!category.grupo && !subGroup)) grupos = [...new Set([...grupos, ...keywordGroups])];
    } else {
      tipo = 'bodyweight';
      grupos = keywordGroups;
    }
    if (grupos.includes('Cardio') && tipo === 'bodyweight') tipo = 'cardio';
  } else {
    grupos = keywordGroups;
    tipo = 'other';
  }

  return { nome, grupos_musculares: grupos, equipamento, secao, tipo, gif_key: key, tamanho_bytes: size, etag };
}

function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Informe o arquivo com a lista de chaves do bucket (JSON: [{ key }]).');
  const keys = JSON.parse(readFileSync(source, 'utf8')) as Array<{ key: string; size?: number; etag?: string }>;
  const catalog = keys
    .map((k) => entryFromKey(k.key, k.size ?? 0, k.etag ?? null))
    .filter((e): e is CatalogEntry => e !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const out = join(__dirname, 'data', 'catalogo_exercicios.json');
  writeFileSync(out, JSON.stringify(catalog, null, 1) + '\n');

  const groups = new Map<string, number>();
  for (const e of catalog) for (const g of e.grupos_musculares) groups.set(g, (groups.get(g) ?? 0) + 1);
  const equipment = new Map<string, number>();
  for (const e of catalog) equipment.set(e.equipamento ?? '(sem equipamento)', (equipment.get(e.equipamento ?? '(sem equipamento)') ?? 0) + 1);
  console.log(`catálogo: ${catalog.length} exercícios → ${out}`);
  console.log(`sem grupo: ${catalog.filter((e) => e.grupos_musculares.length === 0).length}`);
  console.log('grupos:', JSON.stringify([...groups].sort((a, b) => b[1] - a[1])));
  console.log('equipamentos:', JSON.stringify([...equipment].sort((a, b) => b[1] - a[1])));
}

if (require.main === module) main();
