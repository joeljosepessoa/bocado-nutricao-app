import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { authReducer, initialAuthState, type AuthState } from './authReducer';
import { tokenStorage } from './tokenStorage';
import { configureAuthHandlers, setAccessToken } from '../api/client';
import * as api from '../api/endpoints';
import { registerPushToken, revokeCurrentPushToken } from '../notifications/pushRegistration';
import type { AuthTokenPair, LegalVersions, SessionUser } from '../types/api';
import { afterSessionAction, aiConsentMissing, isOutdatedVersionError, type PendingAcceptance } from '../legal/legalGate';
import { legalStorage } from '../legal/legalStorage';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** null enquanto carrega; false = mostrar a tela de boas-vindas/termos antes do login. */
  deviceTermsAccepted: boolean | null;
  /** Primeira abertura (sem login): guarda o aceite no aparelho; vai ao servidor logo após entrar. */
  acceptTermsOnDevice: (versions: LegalVersions) => Promise<void>;
  /** Já logado: registra o aceite (e a autorização das análises) no servidor e libera o app. */
  acceptTerms: (versions: LegalVersions) => Promise<void>;
  /** Já logado, termos em dia: registra a autorização das análises automáticas e libera o app. */
  authorizeAi: () => Promise<void>;
  /** Depois de desativar as análises em Privacidade e dados: o app volta a pedir a autorização. */
  requireAi: () => void;
  updateSessionUser: (user: SessionUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const APP_VERSION = Constants.expoConfig?.version;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  // O refresh token também fica em uma ref para uso síncrono pelo
  // interceptor do axios (que não tem acesso ao estado do React).
  const refreshTokenRef = useRef<string | null>(null);
  const [deviceTermsAccepted, setDeviceTermsAccepted] = useState<boolean | null>(null);

  /**
   * Autorização das análises automáticas (obrigatória): se a pessoa marcou na primeira abertura,
   * envia sozinha; senão o app pede numa tela própria. Servidor fora do ar não trava o app.
   */
  const settleAi = useCallback(async (user: SessionUser, pending: PendingAcceptance | null): Promise<SessionUser> => {
    if (user.role !== 'client') return user;
    try {
      const consent = await api.getAiConsent();
      if (!aiConsentMissing(user.role, consent)) return { ...user, aiConsentRequired: false };
      if (pending?.aiConsent) {
        await api.acceptAiConsent();
        return { ...user, aiConsentRequired: false };
      }
      return { ...user, aiConsentRequired: true };
    } catch {
      return user;
    }
  }, []);

  /**
   * Antes de liberar a sessão: se o servidor pede o aceite e a pessoa já marcou as caixas na
   * primeira abertura do app, envia esse aceite sozinho. O aceite pendente é de uso único
   * (outra pessoa entrando depois no mesmo aparelho vê a tela de novo).
   */
  const settleLegal = useCallback(async (session: AuthTokenPair): Promise<SessionUser> => {
    const pending = await legalStorage.getPending();
    setAccessToken(session.accessToken);
    const action = afterSessionAction(session.user, pending);
    let user = session.user;
    if (action === 'send_pending' && pending) {
      try {
        await api.acceptLegal(
          { termsVersion: pending.termsVersion, privacyVersion: pending.privacyVersion },
          { source: 'mobile_app_first_open', appVersion: APP_VERSION, platform: Platform.OS },
        );
        user = { ...user, termsAcceptanceRequired: false, privacyAcceptedAt: user.privacyAcceptedAt ?? new Date().toISOString() };
      } catch (err) {
        // Texto mudou desde a primeira abertura: a tela aparece com a versão nova.
        if (isOutdatedVersionError(err)) await legalStorage.clearPending();
        return user;
      }
    }
    user = await settleAi(user, pending);
    if (pending) await legalStorage.clearPending();
    return user;
  }, [settleAi]);

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const stored = refreshTokenRef.current ?? (await tokenStorage.getRefreshToken());
    if (!stored) {
      return null;
    }
    try {
      const session = await api.refresh(stored);
      refreshTokenRef.current = session.refreshToken;
      await tokenStorage.setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      const user = await settleLegal(session);
      dispatch({ type: 'SESSION_RESTORED', user, accessToken: session.accessToken });
      return session.accessToken;
    } catch {
      return null;
    }
  }, [settleLegal]);

  const handleSessionExpired = useCallback(() => {
    refreshTokenRef.current = null;
    setAccessToken(null);
    tokenStorage.clear().catch(() => undefined);
    dispatch({ type: 'SESSION_EXPIRED' });
  }, []);

  const handleTermsRequired = useCallback(() => dispatch({ type: 'TERMS_REQUIRED' }), []);

  useEffect(() => {
    configureAuthHandlers({ refresh: doRefresh, onSessionExpired: handleSessionExpired, onTermsRequired: handleTermsRequired });
  }, [doRefresh, handleSessionExpired, handleTermsRequired]);

  useEffect(() => {
    (async () => {
      setDeviceTermsAccepted(await legalStorage.isDeviceAccepted());
      const stored = await tokenStorage.getRefreshToken();
      if (!stored) {
        dispatch({ type: 'BOOT_NO_SESSION' });
        return;
      }
      refreshTokenRef.current = stored;
      const newAccessToken = await doRefresh();
      if (!newAccessToken) {
        await tokenStorage.clear();
        dispatch({ type: 'BOOT_RESTORE_FAILED' });
      }
    })();
    // Deve rodar só uma vez, na montagem — não a cada troca de doRefresh.
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    refreshTokenRef.current = session.refreshToken;
    await tokenStorage.setRefreshToken(session.refreshToken);
    setAccessToken(session.accessToken);
    const user = await settleLegal(session);
    dispatch({ type: 'LOGIN_SUCCESS', user, accessToken: session.accessToken });
    registerPushToken().catch(() => undefined);
  }, [settleLegal]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword);
    dispatch({ type: 'PASSWORD_CHANGED' });
  }, []);

  const acceptTermsOnDevice = useCallback(async (versions: LegalVersions) => {
    await legalStorage.setPending({ ...versions, checkedAt: new Date().toISOString(), aiConsent: true });
    await legalStorage.markDeviceAccepted();
    setDeviceTermsAccepted(true);
  }, []);

  const acceptTerms = useCallback(async (versions: LegalVersions) => {
    await api.acceptLegal(versions, { source: 'mobile_app', appVersion: APP_VERSION, platform: Platform.OS });
    await api.acceptAiConsent();
    await legalStorage.markDeviceAccepted();
    await legalStorage.clearPending();
    setDeviceTermsAccepted(true);
    dispatch({ type: 'AI_AUTHORIZED' });
    dispatch({ type: 'TERMS_ACCEPTED' });
  }, []);

  const authorizeAi = useCallback(async () => {
    await api.acceptAiConsent();
    dispatch({ type: 'AI_AUTHORIZED' });
  }, []);

  const requireAi = useCallback(() => dispatch({ type: 'AI_REQUIRED' }), []);

  const updateSessionUser = useCallback((user: SessionUser) => {
    dispatch({ type: 'PROFILE_UPDATED', user });
  }, []);

  const logout = useCallback(async () => {
    const stored = refreshTokenRef.current;
    // Precisa rodar com o access token ainda válido (revoke exige
    // autenticação) — por isso antes de limpar accessToken/refreshToken.
    await revokeCurrentPushToken();
    refreshTokenRef.current = null;
    setAccessToken(null);
    await tokenStorage.clear();
    dispatch({ type: 'LOGOUT' });
    if (stored) {
      api.logout(stored).catch(() => undefined);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, deviceTermsAccepted, login, changePassword, acceptTermsOnDevice, acceptTerms, authorizeAi, requireAi, updateSessionUser, logout }),
    [state, deviceTermsAccepted, login, changePassword, acceptTermsOnDevice, acceptTerms, authorizeAi, requireAi, updateSessionUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }
  return ctx;
}
