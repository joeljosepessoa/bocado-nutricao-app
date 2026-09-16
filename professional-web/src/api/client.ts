import axios, { type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.startsWith('/auth/web/');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
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
