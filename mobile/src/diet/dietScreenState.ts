import type { DietClientSummary } from '../types/api';

/**
 * Estados da tela "Minha dieta" (puro, testável). Erro de rede/API nunca vira
 * "dieta não publicada"; uma atualização que falha mantém a dieta já carregada.
 */
export type DietScreenState =
  | { status: 'loading' }
  | { status: 'error'; retrying: boolean }
  | { status: 'empty'; refreshing: boolean }
  | { status: 'content'; diet: DietClientSummary; refreshing: boolean; refreshFailed: boolean };

export type DietScreenEvent = { type: 'load' } | { type: 'loaded'; diet: DietClientSummary | null } | { type: 'failed' };

export const DIET_SCREEN_TEXT = {
  loading: 'Carregando sua dieta…',
  error: 'Não foi possível carregar sua dieta.',
  errorHint: 'Verifique sua conexão e tente novamente.',
  retry: 'Tentar novamente',
  refreshFailed: 'Não foi possível atualizar agora. Mostrando a última versão carregada.',
  empty: 'Sua dieta ainda não foi publicada.',
  emptyHint: 'Quando o seu profissional publicar, ela aparece aqui.',
} as const;

export const initialDietScreenState: DietScreenState = { status: 'loading' };

export function dietScreenReducer(state: DietScreenState, event: DietScreenEvent): DietScreenState {
  switch (event.type) {
    case 'load':
      if (state.status === 'content') return { ...state, refreshing: true, refreshFailed: false };
      if (state.status === 'empty') return { status: 'empty', refreshing: true };
      if (state.status === 'error') return { status: 'error', retrying: true };
      return { status: 'loading' };
    case 'loaded':
      return event.diet ? { status: 'content', diet: event.diet, refreshing: false, refreshFailed: false } : { status: 'empty', refreshing: false };
    case 'failed':
      if (state.status === 'content') return { ...state, refreshing: false, refreshFailed: true };
      return { status: 'error', retrying: false };
  }
}
