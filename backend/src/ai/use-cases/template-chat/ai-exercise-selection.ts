/**
 * A biblioteca tem ~5 mil exercícios: mandar todos para a IA a cada mensagem custaria ~100 mil tokens.
 * Aqui o sistema escolhe a parte que importa para o pedido — grupos musculares e equipamentos citados
 * (na conversa toda), sempre os exercícios do treino atual — e só exercícios COM GIF (para todo exercício
 * sugerido ter demonstração). Função pura (testável); a resolução das referências usa o catálogo inteiro.
 */

export interface AiCatalogItem {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string | null;
  hasGif: boolean;
}

export const AI_CATALOG_LIMIT = 350;
const PER_GROUP = 45;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const GROUP_WORDS: Array<[RegExp, string[]]> = [
  [/\b(peito|peitoral|supino)/, ['Peito']],
  [/\b(costas|dorsal|remada|puxada)/, ['Costas']],
  [/\b(perna|pernas|inferiores?|quadriceps|posterior|coxa|lower)/, ['Pernas', 'Glúteos', 'Panturrilha']],
  [/\b(gluteo|bumbum)/, ['Glúteos']],
  [/\b(ombro|deltoide)/, ['Ombros']],
  [/\b(biceps)/, ['Bíceps']],
  [/\b(triceps)/, ['Tríceps']],
  [/\b(braco|bracos)/, ['Bíceps', 'Tríceps', 'Antebraço']],
  [/\b(superiores?|upper)/, ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps']],
  [/\b(abdomen|abdominal|abdominais|core|abs)/, ['Abdômen']],
  [/\b(panturrilha)/, ['Panturrilha']],
  [/\b(lombar)/, ['Lombar']],
  [/\b(cardio|aerobic|hiit|corrida|emagrec)/, ['Cardio']],
  [/\b(mobilidade|yoga)/, ['Mobilidade']],
  [/\b(alongamento|alongar)/, ['Alongamento']],
  [/\b(full ?body|corpo (todo|inteiro)|abc|abcd|abcde|divisao|split|hipertrofia|forca|treino completo)/, ['Peito', 'Costas', 'Pernas', 'Glúteos', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen', 'Panturrilha']],
];

const EQUIPMENT_WORDS: Array<[RegExp, string[]]> = [
  [/\b(halter|halteres)/, ['Halteres']],
  [/\b(barra)/, ['Barra']],
  [/\b(maquina|maquinas|aparelho)/, ['Máquina']],
  [/\b(polia|cabo|crossover)/, ['Cabo / polia']],
  [/\b(kettlebell)/, ['Kettlebell']],
  [/\b(elastico|superband|banda|miniband)/, ['Superband', 'Miniband']],
  [/\b(trx)/, ['TRX']],
  [/\b(peso corporal|sem equipamento|em casa|calistenia)/, ['Peso corporal', '']],
  [/\b(academia)/, ['Halteres', 'Barra', 'Máquina', 'Cabo / polia']],
];

/** Grupos de musculação padrão quando o pedido não diz nada ("monte um treino"). */
const DEFAULT_GROUPS = ['Peito', 'Costas', 'Pernas', 'Glúteos', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen'];

export function selectCatalogForRequest(items: AiCatalogItem[], requestText: string, keepIds: Set<string>, limit = AI_CATALOG_LIMIT): AiCatalogItem[] {
  const text = norm(requestText);
  const groups = new Set(GROUP_WORDS.filter(([re]) => re.test(text)).flatMap(([, g]) => g));
  const equipment = new Set(EQUIPMENT_WORDS.filter(([re]) => re.test(text)).flatMap(([, e]) => e));
  const wantedGroups = groups.size > 0 ? groups : new Set(DEFAULT_GROUPS);
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length >= 5);

  const kept = items.filter((item) => keepIds.has(item.id));
  const candidates = items.filter((item) => item.hasGif && !keepIds.has(item.id) && (equipment.size === 0 || equipment.has(item.equipment ?? '')));
  // Nome citado no pedido ("leg press", "supino") entra primeiro — quem casa mais palavras na frente.
  const named = candidates
    .map((item) => {
      const name = norm(item.name);
      return { item, hits: words.filter((w) => name.includes(w)).length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.item.name.length - b.item.name.length)
    .map((x) => x.item);
  const chosen = new Map<string, AiCatalogItem>();
  for (const item of [...kept, ...named.slice(0, 60)]) chosen.set(item.id, item);

  // Depois, por grupo pedido, os de nome mais curto primeiro (em geral os exercícios básicos).
  const byGroup = new Map<string, AiCatalogItem[]>();
  for (const item of candidates) for (const g of item.muscleGroups) if (wantedGroups.has(g)) byGroup.set(g, [...(byGroup.get(g) ?? []), item]);
  for (const list of byGroup.values()) list.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'pt-BR'));
  for (let round = 0; round < PER_GROUP && chosen.size < limit; round++) {
    for (const list of byGroup.values()) {
      const item = list[round];
      if (item && chosen.size < limit) chosen.set(item.id, item);
    }
  }
  return [...chosen.values()];
}
