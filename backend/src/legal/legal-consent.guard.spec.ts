import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { LegalConsentGuard, legalConsentEnforced } from './legal-consent.guard';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { SKIP_LEGAL_CONSENT_KEY } from './skip-legal-consent.decorator';

function setup(flag: string | undefined, accepted: boolean, metadata: Record<string, boolean> = {}) {
  const reflector = { getAllAndOverride: (key: string) => metadata[key] ?? false } as unknown as Reflector;
  const legal = { hasAcceptedCurrent: jest.fn().mockResolvedValue(accepted) };
  const config = { get: () => flag };
  const guard = new LegalConsentGuard(reflector, legal as never, config as never);
  const ctx = (role?: Role) =>
    ({
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { id: 'u1', role } : undefined }) }),
    }) as never;
  return { guard, legal, ctx };
}

describe('LegalConsentGuard', () => {
  it('flag: só "true" liga', () => {
    expect(legalConsentEnforced(undefined)).toBe(false);
    expect(legalConsentEnforced('')).toBe(false);
    expect(legalConsentEnforced('false')).toBe(false);
    expect(legalConsentEnforced(' TRUE ')).toBe(true);
  });

  it('desligado: não bloqueia nem consulta o banco (apps antigos continuam funcionando)', async () => {
    const { guard, legal, ctx } = setup(undefined, false);
    await expect(guard.canActivate(ctx(Role.client))).resolves.toBe(true);
    expect(legal.hasAcceptedCurrent).not.toHaveBeenCalled();
  });

  it('ligado: paciente sem aceite recebe 403 TERMS_REQUIRED', async () => {
    const { guard, ctx } = setup('true', false);
    await expect(guard.canActivate(ctx(Role.client))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(Role.client))).rejects.toMatchObject({ response: { code: 'TERMS_REQUIRED' } });
  });

  it('ligado: paciente com aceite, profissional, rota pública e rota liberada passam', async () => {
    await expect(setup('true', true).guard.canActivate(setup('true', true).ctx(Role.client))).resolves.toBe(true);
    const pro = setup('true', false);
    await expect(pro.guard.canActivate(pro.ctx(Role.professional))).resolves.toBe(true);
    const pub = setup('true', false, { [IS_PUBLIC_KEY]: true });
    await expect(pub.guard.canActivate(pub.ctx())).resolves.toBe(true);
    const skip = setup('true', false, { [SKIP_LEGAL_CONSENT_KEY]: true });
    await expect(skip.guard.canActivate(skip.ctx(Role.client))).resolves.toBe(true);
  });
});
