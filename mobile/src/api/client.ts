import axios, { type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

function resolveBaseUrl(): string {
  // EXPO_PUBLIC_API_URL (embutida pelo Expo no bundle) tem precedência sobre o
  // app.json: permite apontar para o IP da rede em teste e para a API de
  // produção no build de release sem editar arquivo versionado.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }
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

/** Só para quem precisa anexar o token fora do axios (ex.: `<Image>` carregando mídia autenticada). */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * O AuthContext injeta aqui, depois de montado, como renovar o access
 * token (via refresh token) e o que fazer quando a sessão não é mais
 * recuperável (refresh reutilizado/expirado). Evita import circular entre
 * o client HTTP e o contexto de autenticação.
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
