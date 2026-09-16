import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { authReducer, initialAuthState, type AuthState } from './authReducer';
import { configureAuthHandlers, setAccessToken } from '../api/client';
import * as api from '../api/endpoints';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const handleSessionExpired = useCallback(() => {
    setAccessToken(null);
    dispatch({ type: 'SESSION_EXPIRED' });
  }, []);

  useEffect(() => {
    configureAuthHandlers({ onSessionExpired: handleSessionExpired });
  }, [handleSessionExpired]);

  // Não há refresh token acessível a JS (cookie HttpOnly) — a única forma
  // de saber se existe uma sessão ao carregar a página é tentar renovar;
  // se o cookie não existir ou estiver expirado, o backend responde 401 e
  // caímos em "sem sessão", sem expor nada sobre a existência do cookie.
  useEffect(() => {
    (async () => {
      try {
        const session = await api.refresh();
        setAccessToken(session.accessToken);
        dispatch({ type: 'SESSION_RESTORED', user: session.user, accessToken: session.accessToken });
      } catch {
        dispatch({ type: 'BOOT_NO_SESSION' });
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    setAccessToken(session.accessToken);
    dispatch({ type: 'LOGIN_SUCCESS', user: session.user, accessToken: session.accessToken });
  }, []);

  const logout = useCallback(async () => {
    setAccessToken(null);
    dispatch({ type: 'LOGOUT' });
    try {
      await api.logout();
    } catch {
      // sessão já limpa localmente; falha ao revogar no servidor não deve travar o logout na UI
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
