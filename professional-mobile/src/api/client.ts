import axios, { type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

function resolveBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }
  return 'http://localhost:3000';
}

export const API_BASE_URL = resolveBaseUrl();

let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * O AuthContext injeta aqui, depois de montado, como renovar o access
 * token (via refresh token) e o que fazer quando a sessão não é mais
 * recuperável. Evita import circular entre o client HTTP e o contexto de
 * autenticação — mesmo padrão do app do cliente (Fase 7).
 */
export function configureAuthHandlers(handlers: {
  refresh: () => Promise<string | null>;
  onSessionExpired: () => void;
}): void {
  refreshHandler = handlers.refresh;
  onSessionExpired = handlers.onSessionExpired;
}

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && refreshHandler) {
      original._retry = true;

      if (!refreshInFlight) {
        refreshInFlight = refreshHandler().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;

      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient(original);
      }
      onSessionExpired?.();
    }

    return Promise.reject(error);
  },
);
