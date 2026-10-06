import { createContext, useContext } from 'react';
import type { DraftRef } from '../api/endpoints';

/**
 * Presente só quando a tela edita um RASCUNHO. Sem ele, a estrutura é
 * mostrada somente para leitura (versão publicada).
 */
export interface DraftEdit {
  ref: DraftRef;
  /** Executa a mutação, mostra o erro da API se houver e recarrega a versão. `true` = deu certo. */
  run: (action: () => Promise<unknown>, fallback: string) => Promise<boolean>;
}

export const DraftEditContext = createContext<DraftEdit | null>(null);

export function useDraftEdit(): DraftEdit | null {
  return useContext(DraftEditContext);
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}
