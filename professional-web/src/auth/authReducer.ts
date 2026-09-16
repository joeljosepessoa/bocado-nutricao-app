import type { SessionUser } from '../types/api';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

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
  | { type: 'SESSION_EXPIRED' }
  | { type: 'LOGOUT' };

export const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  accessToken: null,
};

/**
 * Mais simples que a máquina de estados do mobile (Fase 7): não existe
 * troca de senha temporária nem aceite de privacidade para o profissional
 * — esses fluxos são exclusivos do primeiro acesso do cliente.
 */
export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'BOOT_NO_SESSION':
    case 'BOOT_RESTORE_FAILED':
    case 'SESSION_EXPIRED':
    case 'LOGOUT':
      return { status: 'unauthenticated', user: null, accessToken: null };

    case 'SESSION_RESTORED':
    case 'LOGIN_SUCCESS':
      return { status: 'authenticated', user: event.user, accessToken: event.accessToken };

    default:
      return state;
  }
}
