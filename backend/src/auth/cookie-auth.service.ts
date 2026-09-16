import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { parseDurationMs } from '../common/utils/duration';

const COOKIE_NAME = 'bocado_refresh_token';
const COOKIE_PATH = '/auth/web';

type SameSite = 'lax' | 'strict' | 'none';

/**
 * Único lugar que sabe como o refresh token do painel profissional viaja
 * pela borda HTTP (cookie HttpOnly) — o resto da autenticação (emissão,
 * rotação, revogação, detecção de reuso) continua inteiramente em
 * AuthService/RefreshTokenService, reaproveitado sem alteração tanto pelo
 * fluxo mobile (corpo JSON) quanto pelo fluxo web (este serviço).
 */
@Injectable()
export class CookieAuthService {
  private readonly maxAgeMs: number;

  constructor(private readonly config: ConfigService) {
    this.maxAgeMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
  }

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    const sameSite = (this.config.get<string>('AUTH_COOKIE_SAME_SITE') as SameSite) ?? 'lax';
    return {
      httpOnly: true,
      // Secure sempre ligado em produção; em dev funciona também porque o
      // navegador trata localhost como contexto seguro mesmo sem HTTPS.
      secure: this.isProduction,
      sameSite,
      path: COOKIE_PATH,
      maxAge,
    };
  }

  setRefreshCookie(res: Response, rawToken: string): void {
    res.cookie(COOKIE_NAME, rawToken, this.cookieOptions(this.maxAgeMs));
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, this.cookieOptions());
  }

  readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[COOKIE_NAME];
  }
}
