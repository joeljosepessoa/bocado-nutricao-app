import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const REQUIRED_HEADER = 'x-bocado-client';
const REQUIRED_VALUE = 'web';

/**
 * Defesa complementar a SameSite + CORS restrito por origem: exige um
 * cabeçalho customizado que só JavaScript same-origin (via fetch/XHR) pode
 * definir — um POST cross-site disparado por formulário HTML simples
 * (o vetor clássico de CSRF) nunca consegue setar cabeçalhos customizados.
 * Só se aplica às rotas que leem o cookie de refresh (refresh/logout); o
 * login em si não depende de sessão ambiente, então não precisa dela.
 */
@Injectable()
export class WebCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers[REQUIRED_HEADER] !== REQUIRED_VALUE) {
      throw new ForbiddenException('Requisição não permitida.');
    }
    return true;
  }
}
