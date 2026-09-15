import type { SessionUser } from '../types/api';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'mustChangePassword'
  | 'mustAcceptPrivacy'
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
  | { type: 'PRIVACY_ACCEPTED' }
  | { type: 'PROFILE_UPDATED'; user: SessionUser }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'LOGOUT' };

export const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  accessToken: null,
};

/**
 * A senha temporária é resolvida antes do aceite de privacidade: o primeiro
 * acesso do cliente não deveria depender de uma senha compartilhada
 * informalmente pelo profissional para consentir com o tratamento de dados.
 */
function deriveStatus(user: SessionUser): AuthStatus {
  if (user.mustChangePassword) {
    return 'mustChangePassword';
  }
  if (!user.privacyAcceptedAt) {
    return 'mustAcceptPrivacy';
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

    case 'PRIVACY_ACCEPTED': {
      if (!state.user) {
        return state;
      }
      const user: SessionUser = { ...state.user, privacyAcceptedAt: new Date().toISOString() };
      return { ...state, user, status: deriveStatus(user) };
    }

    case 'PROFILE_UPDATED': {
      if (state.status !== 'authenticated' && state.status !== 'mustAcceptPrivacy') {
        return state;
      }
      return { ...state, user: event.user, status: deriveStatus(event.user) };
    }

    default:
      return state;
  }
}
