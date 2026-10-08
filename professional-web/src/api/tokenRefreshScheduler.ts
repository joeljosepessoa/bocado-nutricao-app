/**
 * Agenda a renovação do access token um pouco antes dele expirar, pra nenhuma
 * requisição durante o uso normal sequer chegar a bater 401 (o retry reativo em
 * `client.ts` continua existindo como rede de segurança, ex.: relógio do
 * navegador desalinhado, aba que ficou em segundo plano com timers pausados).
 *
 * Só lê o campo `exp` do JWT pra controlar esse timer local — nunca pra decidir
 * autorização. Quem decide se o token é válido continua sendo só o backend, a
 * cada requisição; se alguém adulterar o token no cliente, a única consequência
 * aqui é um timer agendado errado, não um bypass de nada.
 */

// access token dura 15 min (JWT_ACCESS_EXPIRES_IN) — renova ~2 min antes.
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** Decodifica só o campo `exp` do payload do JWT (sem validar assinatura). null se o token não for um JWT decodificável. */
export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Milissegundos até disparar a renovação proativa. `null` quando o token não é
 * decodificável ou quando já está perto/passou da expiração — nesse caso o
 * retry reativo do interceptor de 401 é quem cobre a renovação.
 */
export function computeRefreshDelayMs(token: string, now: number = Date.now()): number | null {
  const expiresAtMs = decodeJwtExpiryMs(token);
  if (expiresAtMs == null) return null;
  const delay = expiresAtMs - now - REFRESH_MARGIN_MS;
  return delay > 0 ? delay : null;
}

export class ProactiveRefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onDue: () => void;

  constructor(onDue: () => void) {
    this.onDue = onDue;
  }

  /** Reagenda a partir do token atual — cancela qualquer timer pendente antes. */
  schedule(token: string): void {
    this.cancel();
    const delay = computeRefreshDelayMs(token);
    if (delay == null) return;
    this.timer = setTimeout(this.onDue, delay);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
