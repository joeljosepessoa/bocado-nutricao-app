import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { authReducer, initialAuthState, type AuthState } from './authReducer';
import { tokenStorage } from './tokenStorage';
import { configureAuthHandlers, setAccessToken } from '../api/client';
import * as api from '../api/endpoints';
import type { SessionUser } from '../types/api';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  acceptPrivacyTerms: () => Promise<void>;
  updateSessionUser: (user: SessionUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  // O refresh token também fica em uma ref para uso síncrono pelo
  // interceptor do axios (que não tem acesso ao estado do React).
  const refreshTokenRef = useRef<string | null>(null);

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
    refreshTokenRef.current = session.refreshToken;
    await tokenStorage.setRefreshToken(session.refreshToken);
    setAccessToken(session.accessToken);
    dispatch({ type: 'LOGIN_SUCCESS', user: session.user, accessToken: session.accessToken });
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword);
    dispatch({ type: 'PASSWORD_CHANGED' });
  }, []);

  const acceptPrivacyTerms = useCallback(async () => {
    await api.acceptPrivacyTerms();
    dispatch({ type: 'PRIVACY_ACCEPTED' });
  }, []);

  const updateSessionUser = useCallback((user: SessionUser) => {
    dispatch({ type: 'PROFILE_UPDATED', user });
  }, []);

  const logout = useCallback(async () => {
    const stored = refreshTokenRef.current;
    refreshTokenRef.current = null;
    setAccessToken(null);
    await tokenStorage.clear();
    dispatch({ type: 'LOGOUT' });
    if (stored) {
      api.logout(stored).catch(() => undefined);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, changePassword, acceptPrivacyTerms, updateSessionUser, logout }),
    [state, login, changePassword, acceptPrivacyTerms, updateSessionUser, logout],
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
