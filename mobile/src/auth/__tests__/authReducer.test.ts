import { authReducer, initialAuthState, type AuthState } from '../authReducer';
import type { SessionUser } from '../../types/api';

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'client-1',
    email: 'cliente@example.com',
    fullName: 'Cliente Teste',
    role: 'client',
    mustChangePassword: false,
    privacyAcceptedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('authReducer', () => {
  it('começa em loading, sem usuário', () => {
    expect(initialAuthState.status).toBe('loading');
    expect(initialAuthState.user).toBeNull();
  });

  it('BOOT_NO_SESSION leva a unauthenticated', () => {
    const state = authReducer(initialAuthState, { type: 'BOOT_NO_SESSION' });
    expect(state.status).toBe('unauthenticated');
  });

  it('login com senha temporária pendente vai para mustChangePassword, mesmo com privacidade já aceita', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: '2026-01-01T00:00:00.000Z' });
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');
  });

  it('login sem troca de senha pendente mas sem aceite de privacidade vai para mustAcceptPrivacy', () => {
    const user = makeUser({ mustChangePassword: false, privacyAcceptedAt: null });
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustAcceptPrivacy');
  });

  it('primeiro acesso completo (senha temporária + privacidade pendente): troca de senha vem antes', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: null });
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');
  });

  it('login com tudo em dia vai direto para authenticated', () => {
    const user = makeUser();
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('tok');
  });

  it('PASSWORD_CHANGED avança de mustChangePassword para mustAcceptPrivacy quando privacidade ainda não foi aceita', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');

    state = authReducer(state, { type: 'PASSWORD_CHANGED' });
    expect(state.status).toBe('mustAcceptPrivacy');
    expect(state.user?.mustChangePassword).toBe(false);
  });

  it('PRIVACY_ACCEPTED avança de mustAcceptPrivacy para authenticated', () => {
    const user = makeUser({ mustChangePassword: false, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustAcceptPrivacy');

    state = authReducer(state, { type: 'PRIVACY_ACCEPTED' });
    expect(state.status).toBe('authenticated');
    expect(state.user?.privacyAcceptedAt).not.toBeNull();
  });

  it('fluxo completo de primeiro acesso: login -> troca de senha -> aceite de privacidade -> autenticado', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');

    state = authReducer(state, { type: 'PASSWORD_CHANGED' });
    expect(state.status).toBe('mustAcceptPrivacy');

    state = authReducer(state, { type: 'PRIVACY_ACCEPTED' });
    expect(state.status).toBe('authenticated');
  });

  it('LOGOUT limpa usuário e token independente do estado anterior', () => {
    const user = makeUser();
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    state = authReducer(state, { type: 'LOGOUT' });
    expect(state).toEqual({ status: 'unauthenticated', user: null, accessToken: null });
  });

  it('SESSION_EXPIRED (refresh reuse detection) desloga como o LOGOUT', () => {
    const user = makeUser();
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    state = authReducer(state, { type: 'SESSION_EXPIRED' });
    expect(state.status).toBe('unauthenticated');
  });

  it('SESSION_RESTORED (boot com refresh token salvo) reidrata o mesmo status derivado do login', () => {
    const user = makeUser({ mustChangePassword: true });
    const state = authReducer(initialAuthState, { type: 'SESSION_RESTORED', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');
  });

  it('PROFILE_UPDATED é ignorado enquanto não autenticado', () => {
    const state = authReducer(initialAuthState, { type: 'PROFILE_UPDATED', user: makeUser() });
    expect(state).toEqual(initialAuthState);
  });
});
