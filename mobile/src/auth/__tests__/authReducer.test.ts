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

  it('login sem troca de senha pendente mas sem aceite de privacidade vai para mustAcceptTerms', () => {
    const user = makeUser({ mustChangePassword: false, privacyAcceptedAt: null });
    const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustAcceptTerms');
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

  it('PASSWORD_CHANGED avança de mustChangePassword para mustAcceptTerms quando privacidade ainda não foi aceita', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');

    state = authReducer(state, { type: 'PASSWORD_CHANGED' });
    expect(state.status).toBe('mustAcceptTerms');
    expect(state.user?.mustChangePassword).toBe(false);
  });

  it('TERMS_ACCEPTED avança de mustAcceptTerms para authenticated', () => {
    const user = makeUser({ mustChangePassword: false, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustAcceptTerms');

    state = authReducer(state, { type: 'TERMS_ACCEPTED' });
    expect(state.status).toBe('authenticated');
    expect(state.user?.privacyAcceptedAt).not.toBeNull();
  });

  it('fluxo completo de primeiro acesso: login -> troca de senha -> aceite de privacidade -> autenticado', () => {
    const user = makeUser({ mustChangePassword: true, privacyAcceptedAt: null });
    let state: AuthState = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
    expect(state.status).toBe('mustChangePassword');

    state = authReducer(state, { type: 'PASSWORD_CHANGED' });
    expect(state.status).toBe('mustAcceptTerms');

    state = authReducer(state, { type: 'TERMS_ACCEPTED' });
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

  describe('Termos de Uso / Política 1.0', () => {
    it('servidor novo manda termsAcceptanceRequired: quem aceitou só a tela antiga precisa aceitar de novo', () => {
      const user = makeUser({ privacyAcceptedAt: '2026-01-01T00:00:00.000Z', termsAcceptanceRequired: true });
      const state = authReducer(initialAuthState, { type: 'SESSION_RESTORED', user, accessToken: 'tok' });
      expect(state.status).toBe('mustAcceptTerms');
    });

    it('aceite registrado: entra direto, mesmo sem o campo antigo', () => {
      const user = makeUser({ privacyAcceptedAt: null, termsAcceptanceRequired: false });
      expect(authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' }).status).toBe('authenticated');
    });

    it('TERMS_ACCEPTED libera e preenche o campo antigo', () => {
      const user = makeUser({ privacyAcceptedAt: null, termsAcceptanceRequired: true });
      let state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
      state = authReducer(state, { type: 'TERMS_ACCEPTED' });
      expect(state.status).toBe('authenticated');
      expect(state.user?.termsAcceptanceRequired).toBe(false);
      expect(state.user?.privacyAcceptedAt).not.toBeNull();
    });

    it('TERMS_REQUIRED (403 do servidor) volta para a tela de aceite; ignorado fora do app', () => {
      let state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user: makeUser({ termsAcceptanceRequired: false }), accessToken: 'tok' });
      state = authReducer(state, { type: 'TERMS_REQUIRED' });
      expect(state.status).toBe('mustAcceptTerms');
      expect(authReducer(initialAuthState, { type: 'TERMS_REQUIRED' })).toEqual(initialAuthState);
    });

    it('profissional nunca cai na tela de aceite', () => {
      const user = makeUser({ role: 'professional', privacyAcceptedAt: null });
      expect(authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' }).status).toBe('authenticated');
    });
  });
  describe('autorização das análises automáticas (obrigatória)', () => {
    it('termos em dia sem autorização: pede a autorização; autorizar libera', () => {
      const user = makeUser({ termsAcceptanceRequired: false, aiConsentRequired: true });
      const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
      expect(state.status).toBe('mustAuthorizeAi');
      expect(authReducer(state, { type: 'AI_AUTHORIZED' }).status).toBe('authenticated');
    });

    it('termos vêm antes da autorização', () => {
      const user = makeUser({ termsAcceptanceRequired: true, aiConsentRequired: true });
      const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
      expect(state.status).toBe('mustAcceptTerms');
      const afterAi = authReducer(state, { type: 'AI_AUTHORIZED' });
      expect(afterAi.status).toBe('mustAcceptTerms');
      expect(authReducer(afterAi, { type: 'TERMS_ACCEPTED' }).status).toBe('authenticated');
    });

    it('desativar em Privacidade e dados volta a pedir; atualizar o perfil não destrava', () => {
      const user = makeUser({ termsAcceptanceRequired: false, aiConsentRequired: false });
      const state = authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' });
      const revoked = authReducer(state, { type: 'AI_REQUIRED' });
      expect(revoked.status).toBe('mustAuthorizeAi');
      const profile = authReducer(revoked, { type: 'PROFILE_UPDATED', user: makeUser({ termsAcceptanceRequired: false }) });
      expect(profile.status).toBe('mustAuthorizeAi');
    });

    it('profissional nunca cai nessa tela', () => {
      const user = makeUser({ role: 'professional', aiConsentRequired: true });
      expect(authReducer(initialAuthState, { type: 'LOGIN_SUCCESS', user, accessToken: 'tok' }).status).toBe('authenticated');
    });
  });
});
