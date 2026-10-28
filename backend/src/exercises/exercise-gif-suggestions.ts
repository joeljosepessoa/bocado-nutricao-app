import { normalizeExerciseName } from './exercise-name-matching';

/**
 * Sugestões de GIF da biblioteca para um exercício particular sem GIF (tela "Sem GIF").
 * Só SUGERE — quem decide é o profissional, vendo o GIF antes de ligar.
 */
export interface GifCandidate {
  id: string;
  name: string;
  section: string | null;
}

export const MAX_GIF_SUGGESTIONS = 6;

/**
 * Nomes curtos que se usa na academia → exercício da biblioteca que costuma ser o pretendido.
 * Chave = nome-base normalizado (sem acento/caixa e sem o que está entre parênteses).
 */
export const GENERIC_TO_CATALOG: Record<string, string> = {
  'agachamento sumo': 'Agachamento Sumô com Halter',
  'agachamento sumo com halter ou barra': 'Agachamento Sumô com Halter',
  'elevacao pelvica': 'Elevação Pélvica com Barra',
  'elevacao pelvica com barra': 'Elevação Pélvica com Barra',
  'cadeira abdutora': 'Cadeira Abdutora',
  'remada curvada': 'Remada Curvada com Barra',
  'agachamento bulgaro': 'Agachamento Búlgaro com Halteres',
  'agachamento bulgaro smith ou livre': 'Agachamento Búlgaro com Halteres',
  'leg press': 'Leg Press 45 Graus',
  'leg press com pes posicionados mais altos': 'Leg Press com Foco em Glúteo',
  'leg press com pes altos': 'Leg Press com Foco em Glúteo',
  'leg press 45 com pes altos e afastados': 'Leg Press 45 Graus com Base Aberta',
  'rosca martelo': 'Rosca Martelo com Halteres',
  'coice na polia': 'Extensão de Quadril em Pé na Polia',
  'coice de gluteo na maquina': 'Glúteo na Máquina (Coice)',
  crossover: 'Crossover em Pé',
  'pullover na polia': 'Pullover Deitado com Corda na Polia',
  'puxada aberta': 'Puxada Frontal Pegada Aberta na Polia',
  'puxada pela frente': 'Puxada na Polia',
  'puxada frontal': 'Puxada na Polia',
  'puxada supinada': 'Puxada Supinada na Polia',
  'remada baixa': 'Remada Baixa Sentada na Polia',
  'remada sentada': 'Remada Baixa Sentada na Polia',
  'remada unilateral': 'Remada Curvada Unilateral com Halter (Serrote)',
  'triceps frances': 'Extensão de Tríceps Sentado com Halter (Francês)',
  afundo: 'Avanço',
  'afundo caminhando': 'Avanço Caminhando com Halteres',
  'biceps na polia': 'Rosca Direta na Polia',
  desenvolvimento: 'Desenvolvimento Sentado com Halteres',
  'desenvolvimento com halteres': 'Desenvolvimento Sentado com Halteres',
  'desenvolvimento na maquina': 'Desenvolvimento Sentado na Máquina',
  'elevacao frontal': 'Elevação Frontal com Halteres',
  'peito maquina': 'Supino na Máquina',
  'stiff com barra ou halteres': 'Stiff com Barra',
  'stiff ou terra romeno': 'Stiff com Barra',
  'stiff com mini band': 'Stiff com Coluna Reta com Elástico',
  'terra romeno': 'Levantamento Terra Romeno com Barra',
  'terra sumo': 'Levantamento Terra Sumô com Barra',
  'triceps maquina': 'Extensão de Tríceps na Máquina',
  'abducao de quadril na polia': 'Abdução de Quadril na Polia (Versão 2)',
  'crucifixo inverso': 'Crucifixo Inverso Sentado na Máquina',
  'crucifixo invertido': 'Crucifixo Inverso Sentado na Máquina',
  'crucifixo na maquina': 'Voador (Peck Deck)',
  'crucifixo na polia': 'Crossover em Pé',
  'elevacao de panturrilha em pe': 'Elevação de Panturrilha em Pé',
  'elevacao de pernas': 'Elevação de Pernas Deitado',
  'elevacao lateral na polia': 'Elevação Lateral na Polia',
  'extensao de quadril na polia': 'Extensão de Quadril em Pé na Polia',
  'face pull': 'Face Pull em Pé com Corda na Polia',
  'hack squat': 'Agachamento Hack',
  'mesa flexora': 'Mesa Flexora',
  'mesa flexora sentada': 'Cadeira Flexora',
  'cadeira flexora': 'Cadeira Flexora',
  'cadeira flexora unilateral': 'Cadeira Flexora Unilateral',
  'panturrilha sentada': 'Panturrilha Sentado na Máquina com Anilhas',
  'panturrilha sentado': 'Panturrilha Sentado na Máquina com Anilhas',
  prancha: 'Prancha Frontal',
  'rosca alternada': 'Rosca Bíceps Alternada com Halteres',
  'rosca inclinada': 'Rosca Inclinada com Halteres',
  'supino inclinado na maquina': 'Supino Inclinado na Máquina',
  'triceps acima da cabeca na polia': 'Extensão de Tríceps Acima da Cabeça com Corda na Polia',
  'triceps corda': 'Tríceps Corda na Polia',
  'triceps pulley': 'Tríceps Pulley',
  'agachamento livre': 'Agachamento com Barra',
  'hiperextensao 45 foco gluteo': 'Extensão de Quadril a 45 Graus com Foco em Glúteo',
};

const STOP = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'com', 'na', 'no', 'nas', 'nos', 'em', 'para', 'por', 'ao', 'ou']);

/** Nome sem o que está entre parênteses ("Cadeira abdutora (3 s de contração no pico)" → "cadeira abdutora"). */
export function baseExerciseName(name: string): string {
  return normalizeExerciseName(name.replace(/\([^)]*\)/g, ' '));
}

/** Singular grosseiro só para comparar ("halteres" ≡ "halter", "pernas" ≡ "perna"). */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokensOf(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map(stem);
}

export interface GifIndex<T extends GifCandidate> {
  byName: Map<string, T>;
  entries: Array<{ c: T; tokens: string[]; gym: number }>;
}

/** Prepara a biblioteca uma vez para sugerir para vários exercícios. */
export function buildGifIndex<T extends GifCandidate>(library: T[]): GifIndex<T> {
  return {
    byName: new Map(library.map((c) => [normalizeExerciseName(c.name), c])),
    entries: library.map((c) => ({ c, tokens: tokensOf(normalizeExerciseName(c.name)), gym: (c.section ?? '').startsWith('ACADEMIA') ? 0 : 1 })),
  };
}

/**
 * Até MAX_GIF_SUGGESTIONS candidatos com GIF: primeiro o equivalente conhecido (GENERIC_TO_CATALOG), depois
 * os que têm todas as palavras do nome-base (academia antes de funcional; nome mais curto antes).
 */
export function suggestGifCandidates<T extends GifCandidate>(name: string, library: T[] | GifIndex<T>): T[] {
  const index = Array.isArray(library) ? buildGifIndex(library) : library;
  const base = baseExerciseName(name);
  const picked: T[] = [];
  const add = (c: T | undefined) => {
    if (c && !picked.some((p) => p.id === c.id)) picked.push(c);
  };
  const known = GENERIC_TO_CATALOG[base];
  if (known) add(index.byName.get(normalizeExerciseName(known)));
  add(index.byName.get(base));

  const wanted = tokensOf(base);
  if (wanted.length > 0) {
    const scored = index.entries
      .map((e) => {
        const matched = wanted.filter((w) => e.tokens.includes(w)).length;
        return { c: e.c, matched, extra: e.tokens.length - matched, gym: e.gym };
      })
      .filter((s) => s.matched === wanted.length || (wanted.length >= 3 && s.matched >= wanted.length - 1))
      .sort((a, b) => b.matched - a.matched || a.gym - b.gym || a.extra - b.extra || a.c.name.localeCompare(b.c.name, 'pt-BR'));
    for (const s of scored) {
      if (picked.length >= MAX_GIF_SUGGESTIONS) break;
      add(s.c);
    }
  }
  return picked.slice(0, MAX_GIF_SUGGESTIONS);
}
