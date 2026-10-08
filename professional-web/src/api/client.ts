import axios, { type InternalAxiosRequestConfig } from 'axios';
import { ProactiveRefreshScheduler } from './tokenRefreshScheduler';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

// Dispara ~2 min antes do access token expirar, pra renovar antes de qualquer
// requisição bater 401 — reaproveita a mesma `triggerRefresh` (dedup incluído)
// do retry reativo do interceptor abaixo.
const proactiveRefresh = new ProactiveRefreshScheduler(() => {
  void triggerRefresh();
});

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) {
    proactiveRefresh.schedule(token);
  } else {
    proactiveRefresh.cancel();
  }
}

/** Cancela o timer de renovação proativa — chamado explicitamente no logout/desmonte do AuthProvider. */
export function cancelProactiveTokenRefresh(): void {
  proactiveRefresh.cancel();
}

export function configureAuthHandlers(handlers: { onSessionExpired: () => void }): void {
  onSessionExpired = handlers.onSessionExpired;
}

/**
 * `withCredentials: true` para que o cookie HttpOnly de refresh (Fase 9)
 * viaje nas chamadas a /auth/web/*; o cabeçalho customizado é a defesa
 * CSRF complementar exigida por WebCsrfGuard no backend para as rotas que
 * de fato leem esse cookie.
 */
export const apiClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set('X-Bocado-Client', 'web');
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post<{ accessToken: string }>(
      `${API_BASE_URL}/auth/web/refresh`,
      {},
      { withCredentials: true, headers: { 'X-Bocado-Client': 'web' } },
    );
    setAccessToken(res.data.accessToken);
    return res.data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Ponto único de renovação: tanto o timer proativo quanto o retry reativo de
 * 401 passam por aqui, então nunca disparam dois `POST /auth/web/refresh`
 * simultâneos — `refreshInFlight` é compartilhado pelos dois caminhos.
 */
async function triggerRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  const newToken = await refreshInFlight;
  if (!newToken) {
    onSessionExpired?.();
  }
  return newToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.startsWith('/auth/web/');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await triggerRefresh();
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient(original);
      }
    }

    return Promise.reject(error);
  },
);
