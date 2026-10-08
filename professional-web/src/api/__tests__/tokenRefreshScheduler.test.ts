import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProactiveRefreshScheduler, computeRefreshDelayMs, decodeJwtExpiryMs } from '../tokenRefreshScheduler';

function makeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.signature`;
}

describe('decodeJwtExpiryMs', () => {
  it('lê o exp (em segundos) e converte pra milissegundos', () => {
    const token = makeJwt({ exp: 1_700_000_000 });
    expect(decodeJwtExpiryMs(token)).toBe(1_700_000_000 * 1000);
  });

  it('retorna null pra token sem exp', () => {
    expect(decodeJwtExpiryMs(makeJwt({ sub: 'user-1' }))).toBeNull();
  });

  it('retorna null pra string que não é um JWT decodificável', () => {
    expect(decodeJwtExpiryMs('nao-e-um-jwt')).toBeNull();
    expect(decodeJwtExpiryMs('')).toBeNull();
  });
});

describe('computeRefreshDelayMs', () => {
  it('agenda ~2 min antes da expiração', () => {
    const now = 1_000_000;
    const expiresAtMs = now + 15 * 60 * 1000; // access token de 15 min
    const token = makeJwt({ exp: expiresAtMs / 1000 });
    const delay = computeRefreshDelayMs(token, now);
    expect(delay).toBe(15 * 60 * 1000 - 2 * 60 * 1000);
  });

  it('retorna null quando o token já expirou ou está a menos de 2 min de expirar', () => {
    const now = 1_000_000;
    const token = makeJwt({ exp: (now + 60 * 1000) / 1000 }); // expira em 1 min
    expect(computeRefreshDelayMs(token, now)).toBeNull();
  });

  it('retorna null pra token não decodificável', () => {
    expect(computeRefreshDelayMs('token-invalido')).toBeNull();
  });
});

describe('ProactiveRefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara onDue depois do delay calculado a partir do exp', () => {
    const onDue = vi.fn();
    const scheduler = new ProactiveRefreshScheduler(onDue);
    const now = Date.now();
    const token = makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 });

    scheduler.schedule(token);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(13 * 60 * 1000 - 1);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(onDue).toHaveBeenCalledTimes(1);
  });

  it('cancel() impede o disparo', () => {
    const onDue = vi.fn();
    const scheduler = new ProactiveRefreshScheduler(onDue);
    const now = Date.now();
    const token = makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 });

    scheduler.schedule(token);
    scheduler.cancel();
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(onDue).not.toHaveBeenCalled();
  });

  it('schedule() reagenda: um novo schedule cancela o timer anterior', () => {
    const onDue = vi.fn();
    const scheduler = new ProactiveRefreshScheduler(onDue);
    const now = Date.now();

    scheduler.schedule(makeJwt({ exp: (now + 15 * 60 * 1000) / 1000 }));
    scheduler.schedule(makeJwt({ exp: (now + 30 * 60 * 1000) / 1000 }));

    vi.advanceTimersByTime(13 * 60 * 1000);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(onDue).toHaveBeenCalledTimes(1);
  });

  it('não agenda nada pra token sem exp decodificável', () => {
    const onDue = vi.fn();
    const scheduler = new ProactiveRefreshScheduler(onDue);
    scheduler.schedule('token-invalido');
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(onDue).not.toHaveBeenCalled();
  });
});
