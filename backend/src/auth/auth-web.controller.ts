import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { CookieAuthService } from './cookie-auth.service';
import { WebCsrfGuard } from './web-csrf.guard';
import { LoginDto } from './dto/login.dto';
import { AUTH_THROTTLE_LIMIT, extractMeta } from './auth-http.util';
import type { AuthTokenPair } from './auth.service';

function toWebSession(session: AuthTokenPair) {
  return { accessToken: session.accessToken, user: session.user };
}

/**
 * Fluxo de autenticação do painel profissional (web) — só a borda HTTP
 * difere do fluxo mobile em auth.controller.ts: aqui o refresh token nunca
 * chega a JavaScript, viaja só como cookie HttpOnly. Toda a lógica de
 * emissão/rotação/revogação continua em AuthService/RefreshTokenService,
 * exatamente a mesma usada pelo mobile — nada duplicado.
 */
@Controller('auth/web')
export class AuthWebController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieAuth: CookieAuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto, extractMeta(req));
    if (session.user.role !== Role.professional && session.user.role !== Role.admin) {
      throw new ForbiddenException('Esta conta não tem acesso ao painel profissional.');
    }
    this.cookieAuth.setRefreshCookie(res, session.refreshToken);
    return toWebSession(session);
  }

  @Public()
  @UseGuards(WebCsrfGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.cookieAuth.readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Sessão não encontrada.');
    }
    const session = await this.authService.refresh(rawToken, extractMeta(req));
    this.cookieAuth.setRefreshCookie(res, session.refreshToken);
    return toWebSession(session);
  }

  @Public()
  @UseGuards(WebCsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const rawToken = this.cookieAuth.readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    this.cookieAuth.clearRefreshCookie(res);
  }
}
