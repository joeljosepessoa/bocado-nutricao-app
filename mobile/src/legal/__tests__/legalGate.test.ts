import {
  acceptedAtLabel,
  afterSessionAction,
  aiConsentMissing,
  canContinue,
  isOutdatedVersionError,
  isTermsRequiredError,
  termsRequired,
  versionDateLabel,
  type PendingAcceptance,
} from '../legalGate';
import type { SessionUser } from '../../types/api';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'c1',
    email: 'cliente@example.com',
    fullName: 'Cliente Teste',
    role: 'client',
    mustChangePassword: false,
    privacyAcceptedAt: null,
    ...overrides,
  };
}

const PENDING: PendingAcceptance = { termsVersion: '1.0', privacyVersion: '1.0', checkedAt: '2026-10-26T12:00:00.000Z' };
const V = { termsVersion: '1.0', privacyVersion: '1.0' };

describe('aceite dos Termos de Uso / Política de Privacidade', () => {
  it('"Continuar" só libera com as três caixas marcadas e os documentos carregados', () => {
    expect(canContinue(false, false, false, V)).toBe(false);
    expect(canContinue(true, false, true, V)).toBe(false);
    expect(canContinue(false, true, true, V)).toBe(false);
    expect(canContinue(true, true, false, V)).toBe(false);
    expect(canContinue(true, true, true, null)).toBe(false);
    expect(canContinue(true, true, true, V)).toBe(true);
  });

  it('autorização das análises automáticas: obrigatória só para paciente, e sem resposta do servidor não trava', () => {
    expect(aiConsentMissing('client', { aiDataProcessingConsentAt: null })).toBe(true);
    expect(aiConsentMissing('client', { aiDataProcessingConsentAt: '2026-10-29T12:00:00Z' })).toBe(false);
    expect(aiConsentMissing('client', null)).toBe(false);
    expect(aiConsentMissing('professional', { aiDataProcessingConsentAt: null })).toBe(false);
  });

  it('servidor novo decide pelo termsAcceptanceRequired (aceite antigo não vale como 1.0)', () => {
    expect(termsRequired(user({ privacyAcceptedAt: '2026-01-01T00:00:00Z', termsAcceptanceRequired: true }))).toBe(true);
    expect(termsRequired(user({ privacyAcceptedAt: null, termsAcceptanceRequired: false }))).toBe(false);
  });

  it('servidor antigo (sem o campo): vale o aceite antigo', () => {
    expect(termsRequired(user({ privacyAcceptedAt: null }))).toBe(true);
    expect(termsRequired(user({ privacyAcceptedAt: '2026-01-01T00:00:00Z' }))).toBe(false);
  });

  it('profissional nunca precisa aceitar pelo app', () => {
    expect(termsRequired(user({ role: 'professional', termsAcceptanceRequired: true }))).toBe(false);
  });

  it('depois do login: envia sozinho o aceite da primeira abertura; sem ele, mostra a tela', () => {
    expect(afterSessionAction(user({ termsAcceptanceRequired: true }), PENDING)).toBe('send_pending');
    expect(afterSessionAction(user({ termsAcceptanceRequired: true }), null)).toBe('ask');
    expect(afterSessionAction(user({ termsAcceptanceRequired: false }), PENDING)).toBe('none');
  });

  it('reconhece os erros do servidor', () => {
    expect(isTermsRequiredError({ response: { status: 403, data: { code: 'TERMS_REQUIRED' } } })).toBe(true);
    expect(isTermsRequiredError({ response: { status: 403, data: {} } })).toBe(false);
    expect(isTermsRequiredError(new Error('rede'))).toBe(false);
    expect(isOutdatedVersionError({ response: { status: 400, data: { code: 'LEGAL_VERSION_OUTDATED' } } })).toBe(true);
    expect(isOutdatedVersionError({ response: { status: 400, data: { message: 'x' } } })).toBe(false);
  });

  it('rótulos de data', () => {
    expect(versionDateLabel('2026-10-26')).toBe('26/10/2026');
    expect(acceptedAtLabel('2026-10-26T17:32:00.000Z')).toMatch(/^Aceitos em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\.$/);
  });
});
