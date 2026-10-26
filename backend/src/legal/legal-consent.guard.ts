import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LegalService } from './legal.service';
import { SKIP_LEGAL_CONSENT_KEY } from './skip-legal-consent.decorator';

export const TERMS_REQUIRED_CODE = 'TERMS_REQUIRED';

/** LEGAL_CONSENT_ENFORCED=true liga a trava. Desligada por padrão. */
export function legalConsentEnforced(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Trava no servidor: paciente que ainda não aceitou os Termos/Política vigentes não acessa nada
 * além das rotas marcadas com @SkipLegalConsent — não adianta pular a tela no app.
 *
 * Fica DESLIGADA por padrão (LEGAL_CONSENT_ENFORCED) porque o app antigo (até 1.2.x) não tem a tela
 * nova e o paciente ficaria preso; liga-se depois que os pacientes atualizarem o app.
 */
@Injectable()
export class LegalConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly legal: LegalService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!legalConsentEnforced(this.config.get<string>('LEGAL_CONSENT_ENFORCED'))) return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_LEGAL_CONSENT_KEY, targets)) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user || user.role !== Role.client) return true;
    if (await this.legal.hasAcceptedCurrent(user.id)) return true;

    throw new ForbiddenException({
      statusCode: 403,
      code: TERMS_REQUIRED_CODE,
      message: 'Para continuar, aceite os Termos de Uso e a Política de Privacidade.',
    });
  }
}
