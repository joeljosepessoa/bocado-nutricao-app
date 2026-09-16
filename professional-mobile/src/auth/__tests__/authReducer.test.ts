import { authReducer, initialAuthState } from '../authReducer';
import type { SessionUser } from '../../types/api';

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'professional-1',
    email: 'profissional@example.com',
    fullName: 'Profissional Teste',
    role: 'professional',
    ...overrides,
  };
}

describe('authReducer (professional-mobile)', () => {
  it('começa em loading, sem usuário', () => {
    expect(initialAuthState.status).toBe('loading');
    expect(initialAuthState.user).toBeNull();
  });

  it('BOOT_NO_SESSION leva a unauthenticated', () => {
    const state = authReducer(initialAuthState, { type: 'BOOT_NO_SESSION' });
    expect(state.status).toBe('unauthenticated');
  });

  it('BOOT_RESTORE_FAILED leva a unauthenticated', () => {
    const state = authReducer(initialAuthState, { type: 'BOOT_RESTORE_FAILED' });
    expect(state.status).toBe('unauthenticated');
  });

  it('LOGIN_SUCCESS vai direto para authenticated — sem estado intermediário', () => {
    const user = makeUser();
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBe('tok');
  });

  it('SESSION_RESTORED (boot com refresh token salvo) também vai para authenticated', () => {
    const user = makeUser();
    const state = authReducer(initialAuthState, { type: 'SESSION_RESTORED', user, accessToken: 'tok' });
    expect(state.status).toBe('authenticated');
  });

  it('LOGOUT limpa usuário e token independente do estado anterior', () => {
    const user = makeUser();
    let state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    state = authReducer(state, { type: 'LOGOUT' });
    expect(state).toEqual({ status: 'unauthenticated', user: null, accessToken: null });
  });

  it('SESSION_EXPIRED (refresh reuso detectado) desloga como o LOGOUT', () => {
    const user = makeUser();
    let state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    state = authReducer(state, { type: 'SESSION_EXPIRED' });
    expect(state.status).toBe('unauthenticated');
  });
});
