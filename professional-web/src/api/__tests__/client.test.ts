import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  requestInterceptor: null as ((config: unknown) => unknown) | null,
  responseRejected: null as ((error: unknown) => Promise<unknown>) | null,
}));

vi.mock('axios', () => {
  function createInstance() {
    const instance = vi.fn(() => Promise.resolve({ data: {} })) as unknown as {
      (...args: unknown[]): Promise<unknown>;
      interceptors: {
        request: { use: (fn: (config: unknown) => unknown) => void };
        response: { use: (fulfilled: (r: unknown) => unknown, rejected: (e: unknown) => Promise<unknown>) => void };
      };
    };
    instance.interceptors = {
      request: {
        use: (fn: (config: unknown) => unknown) => {
          mocks.requestInterceptor = fn;
        },
      },
      response: {
        use: (_fulfilled: (r: unknown) => unknown, rejected: (e: unknown) => Promise<unknown>) => {
          mocks.responseRejected = rejected;
        },
      },
    };
    return instance;
  }

  return {
    default: {
      create: vi.fn(createInstance),
      post: mocks.post,
    },
  };
});

function makeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.signature`;
}

function makeUnauthorizedError(url: string) {
  return {
    response: { status: 401 },
    config: { url, _retry: false, headers: { set: vi.fn() } },
  };
}

describe('api/client — renovação de token', () => {
  beforeEach(async () => {
    mocks.post.mockReset();
    mocks.post.mockResolvedValue({ data: { accessToken: 'renewed-token' } });
    const { setAccessToken, configureAuthHandlers } = await import('../client');
    setAccessToken(null);
    configureAuthHandlers({ onSessionExpired: vi.fn() });
  });

  afterEach(async () => {
    const { setAccessToken } = await import('../client');
    setAccessToken(null);
    vi.useRealTimers();
  });

  it('injeta X-Bocado-Client e Authorization quando há access token', async () => {
    const { setAccessToken } = await import('../client');
    setAccessToken('meu-token');

    const headers = { set: vi.fn() };
    mocks.requestInterceptor!({ headers });

    expect(headers.set).toHaveBeenCalledWith('X-Bocado-Client', 'web');
    expect(headers.set).toHaveBeenCalledWith('Authorization', 'Bearer meu-token');
  });

  it('não dispara duas chamadas de refresh simultâneas em 401s concorrentes (dedup)', async () => {
    const err1 = makeUnauthorizedError('/clients');
    const err2 = makeUnauthorizedError('/clients/2');

    const p1 = mocks.responseRejected!(err1).catch(() => undefined);
    const p2 = mocks.responseRejected!(err2).catch(() => undefined);

    await Promise.all([p1, p2]);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/web/refresh'),
      {},
      expect.objectContaining({ withCredentials: true }),
    );
  });

  it('não tenta renovar em erro 401 vindo de uma rota /auth/web/* (evita loop)', async () => {
    const err = makeUnauthorizedError('/auth/web/login');
    await mocks.responseRejected!(err).catch(() => undefined);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('o timer de renovação proativa dispara uma renovação perto da expiração do access token', async () => {
    vi.useFakeTimers();
    const { setAccessToken } = await import('../client');
    const now = Date.now();
    const token = makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 });

    setAccessToken(token);
    vi.advanceTimersByTime(13 * 60 * 1000 + 1);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/web/refresh'),
      {},
      expect.objectContaining({ withCredentials: true }),
    );
  });

  it('cancelProactiveTokenRefresh() cancela o timer agendado', async () => {
    vi.useFakeTimers();
    const { setAccessToken, cancelProactiveTokenRefresh } = await import('../client');
    const now = Date.now();
    const token = makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 });

    setAccessToken(token);
    cancelProactiveTokenRefresh();
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('setAccessToken(null) também cancela qualquer timer pendente', async () => {
    vi.useFakeTimers();
    const { setAccessToken } = await import('../client');
    const now = Date.now();
    const token = makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 });

    setAccessToken(token);
    setAccessToken(null);
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(mocks.post).not.toHaveBeenCalled();
  });
});
