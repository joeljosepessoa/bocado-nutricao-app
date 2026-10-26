import type { SessionUser } from '../types/api';
import { termsRequired } from '../legal/legalGate';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'mustChangePassword'
  | 'mustAcceptTerms'
  | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  accessToken: string | null;
}

export type AuthEvent =
  | { type: 'BOOT_NO_SESSION' }
  | { type: 'BOOT_RESTORE_FAILED' }
  | { type: 'SESSION_RESTORED'; user: SessionUser; accessToken: string }
  | { type: 'LOGIN_SUCCESS'; user: SessionUser; accessToken: string }
  | { type: 'PASSWORD_CHANGED' }
  | { type: 'TERMS_ACCEPTED' }
  /** O servidor recusou com TERMS_REQUIRED (ex.: os termos mudaram com o app aberto). */
  | { type: 'TERMS_REQUIRED' }
  | { type: 'PROFILE_UPDATED'; user: SessionUser }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'LOGOUT' };

export const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  accessToken: null,
};

/**
 * A senha temporária é resolvida antes do aceite dos Termos/Política: o primeiro
 * acesso do cliente não deveria depender de uma senha compartilhada
 * informalmente pelo profissional para consentir com o tratamento de dados.
 * (Na primeira abertura do app o aceite já acontece antes do login e é enviado
 * sozinho ao entrar — então normalmente esta etapa nem aparece.)
 */
function deriveStatus(user: SessionUser): AuthStatus {
  if (user.mustChangePassword) {
    return 'mustChangePassword';
  }
  if (termsRequired(user)) {
    return 'mustAcceptTerms';
  }
  return 'authenticated';
}

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'BOOT_NO_SESSION':
    case 'BOOT_RESTORE_FAILED':
    case 'SESSION_EXPIRED':
    case 'LOGOUT':
      return { status: 'unauthenticated', user: null, accessToken: null };

    case 'SESSION_RESTORED':
    case 'LOGIN_SUCCESS':
      return {
        status: deriveStatus(event.user),
        user: event.user,
        accessToken: event.accessToken,
      };

    case 'PASSWORD_CHANGED': {
      if (!state.user) {
        return state;
      }
      const user: SessionUser = { ...state.user, mustChangePassword: false };
      return { ...state, user, status: deriveStatus(user) };
    }

    case 'TERMS_ACCEPTED': {
      if (!state.user) {
        return state;
      }
      const user: SessionUser = {
        ...state.user,
        termsAcceptanceRequired: false,
        privacyAcceptedAt: state.user.privacyAcceptedAt ?? new Date().toISOString(),
      };
      return { ...state, user, status: deriveStatus(user) };
    }

    case 'TERMS_REQUIRED': {
      if (!state.user || state.status !== 'authenticated') {
        return state;
      }
      const user: SessionUser = { ...state.user, termsAcceptanceRequired: true };
      return { ...state, user, status: deriveStatus(user) };
    }

    case 'PROFILE_UPDATED': {
      if (state.status !== 'authenticated' && state.status !== 'mustAcceptTerms') {
        return state;
      }
      return { ...state, user: event.user, status: deriveStatus(event.user) };
    }

    default:
      return state;
  }
}
