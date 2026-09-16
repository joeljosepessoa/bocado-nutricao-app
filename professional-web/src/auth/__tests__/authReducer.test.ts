import { describe, expect, it } from 'vitest';
import { authReducer, initialAuthState, type AuthState } from '../authReducer';
import type { SessionUser } from '../../types/api';

function makeUser(): SessionUser {
  return { id: 'prof-1', email: 'prof@example.com', fullName: 'Profissional Teste', role: 'professional' };
}

describe('authReducer (painel profissional)', () => {
  it('começa em loading, sem usuário', () => {
    expect(initialAuthState.status).toBe('loading');
    expect(initialAuthState.user).toBeNull();
  });

  it('BOOT_NO_SESSION leva a unauthenticated', () => {
    const state = authReducer(initialAuthState, { type: 'BOOT_NO_SESSION' });
    expect(state.status).toBe('unauthenticated');
  });

  it('LOGIN_SUCCESS vai direto para authenticated (sem estados intermediários do cliente)', () => {
    const user = makeUser();
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('tok');
    expect(state.user).toEqual(user);
  });

  it('SESSION_RESTORED (boot com refresh via cookie) também autentica direto', () => {
    const state = authReducer(initialAuthState, { type: 'SESSION_RESTORED', user: makeUser(), accessToken: 'tok' });
    expect(state.status).toBe('authenticated');
  });

  it('LOGOUT limpa usuário e token', () => {
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user: makeUser(), accessToken: 'tok' });
    state = authReducer(state, { type: 'LOGOUT' });
    expect(state).toEqual({ status: 'unauthenticated', user: null, accessToken: null });
  });

  it('SESSION_EXPIRED desloga como o LOGOUT', () => {
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user: makeUser(), accessToken: 'tok' });
    state = authReducer(state, { type: 'SESSION_EXPIRED' });
    expect(state.status).toBe('unauthenticated');
  });
});
