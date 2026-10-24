/**
 * Conversa com a IA de cada modelo, guardada só enquanto o painel está aberto (não vai ao servidor).
 * Assim a conversa continua depois de salvar um modelo novo (a tela troca de endereço) e quando o
 * profissional sai e volta ao mesmo modelo.
 */
export interface ChatBubble {
  role: 'professional' | 'assistant';
  text: string;
  warnings?: string[];
  summary?: string | null;
  changed?: boolean;
  failed?: boolean;
}

const memory = new Map<string, ChatBubble[]>();

export const newTemplateChatKey = (kind: string) => `novo-${kind}`;

export function readChat(key: string): ChatBubble[] {
  return memory.get(key) ?? [];
}

export function writeChat(key: string, bubbles: ChatBubble[]) {
  memory.set(key, bubbles);
}

export function forgetChat(key: string) {
  memory.delete(key);
}

/** Modelo novo acabou de ser salvo: a conversa passa a ser dele. */
export function moveChat(from: string, to: string) {
  const bubbles = memory.get(from);
  if (bubbles) memory.set(to, bubbles);
  memory.delete(from);
}
