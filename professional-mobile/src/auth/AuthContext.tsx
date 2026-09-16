import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { authReducer, initialAuthState, type AuthState } from './authReducer';
import { tokenStorage } from './tokenStorage';
import { configureAuthHandlers, setAccessToken } from '../api/client';
import * as api from '../api/endpoints';
import { registerPushToken, revokeCurrentPushToken } from '../notifications/pushRegistration';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Este app é só para profissionais — credencial de cliente é recusada aqui, antes de abrir sessão. */
class WrongRoleError extends Error {}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const refreshTokenRef = useRef<string | null>(null);

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const stored = refreshTokenRef.current ?? (await tokenStorage.getRefreshToken());
    if (!stored) {
      return null;
    }
    try {
      const session = await api.refresh(stored);
      if (session.user.role !== 'professional') {
        return null;
      }
      refreshTokenRef.current = session.refreshToken;
      await tokenStorage.setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      dispatch({ type: 'SESSION_RESTORED', user: session.user, accessToken: session.accessToken });
      return session.accessToken;
    } catch {
      return null;
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    refreshTokenRef.current = null;
    setAccessToken(null);
    tokenStorage.clear().catch(() => undefined);
    dispatch({ type: 'SESSION_EXPIRED' });
  }, []);

  useEffect(() => {
    configureAuthHandlers({ refresh: doRefresh, onSessionExpired: handleSessionExpired });
  }, [doRefresh, handleSessionExpired]);

  useEffect(() => {
    (async () => {
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
    if (session.user.role !== 'professional') {
      throw new WrongRoleError('Este aplicativo é só para profissionais.');
    }
    refreshTokenRef.current = session.refreshToken;
    await tokenStorage.setRefreshToken(session.refreshToken);
    setAccessToken(session.accessToken);
    dispatch({ type: 'LOGIN_SUCCESS', user: session.user, accessToken: session.accessToken });
    registerPushToken().catch(() => undefined);
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

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }
  return ctx;
}
