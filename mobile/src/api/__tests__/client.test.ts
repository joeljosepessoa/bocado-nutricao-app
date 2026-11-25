import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { apiClient, configureAuthHandlers, setAccessToken } from '../client';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) {
    const error = Object.assign(new Error(`HTTP ${status}`), { config, response, isAxiosError: true });
    return Promise.reject(error);
  }
  return Promise.resolve(response);
}

describe('apiClient — renovação do login', () => {
  afterEach(() => {
    setAccessToken(null);
    apiClient.defaults.adapter = undefined;
  });

  it('login guardado vencido: o 401 do /auth/refresh termina (não fica girando para sempre)', async () => {
    const calls: string[] = [];
    apiClient.defaults.adapter = ((config) => {
      calls.push(config.url ?? '');
      return respond(config, 401, { message: 'Unauthorized' });
    }) as AxiosAdapter;
    // Como o AuthContext faz: a renovação chama o próprio /auth/refresh pelo apiClient.
    const refresh = async () => {
      try {
        await apiClient.post('/auth/refresh', { refreshToken: 'vencido' });
        return 'novo';
      } catch {
        return null;
      }
    };
    const expired = jest.fn();
    configureAuthHandlers({ refresh, onSessionExpired: expired });

    await expect(refresh()).resolves.toBeNull();
    expect(calls).toEqual(['/auth/refresh']);
  });

  it('401 numa chamada comum renova uma vez e repete com o token novo', async () => {
    const seen: Array<{ url: string; auth: unknown }> = [];
    apiClient.defaults.adapter = ((config) => {
      seen.push({ url: config.url ?? '', auth: config.headers?.Authorization });
      if (config.url === '/auth/refresh') return respond(config, 200, { accessToken: 'novo' });
      return config.headers?.Authorization === 'Bearer novo' ? respond(config, 200, { ok: true }) : respond(config, 401, {});
    }) as AxiosAdapter;
    setAccessToken('velho');
    configureAuthHandlers({
      refresh: async () => {
        const res = await apiClient.post('/auth/refresh', { refreshToken: 'ok' });
        setAccessToken(res.data.accessToken);
        return res.data.accessToken as string;
      },
      onSessionExpired: jest.fn(),
    });

    const res = await apiClient.get('/client/workouts/current');
    expect(res.data).toEqual({ ok: true });
    expect(seen.map((s) => s.url)).toEqual(['/client/workouts/current', '/auth/refresh', '/client/workouts/current']);
  });
});
