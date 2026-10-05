import { AI_FEATURES, consentStatusLabel, isConsentGranted, setAiConsent, type AiConsentApi } from '../aiConsent';

function fakeApi(initial: string | null) {
  let state = initial;
  const api: AiConsentApi & { calls: string[] } = {
    calls: [],
    async getAiConsent() {
      api.calls.push('get');
      return { aiDataProcessingConsentAt: state };
    },
    async acceptAiConsent() {
      api.calls.push('accept');
      state = state ?? '2026-10-05T12:00:00Z';
    },
    async revokeAiConsent() {
      api.calls.push('revoke');
      state = null;
    },
  };
  return api;
}

describe('consentimento de IA no app', () => {
  it('estado e rótulo: não autorizado x autorizado com data', () => {
    expect(isConsentGranted({ aiDataProcessingConsentAt: null })).toBe(false);
    expect(isConsentGranted(undefined)).toBe(false);
    expect(isConsentGranted({ aiDataProcessingConsentAt: '2026-10-05T12:00:00Z' })).toBe(true);
    expect(consentStatusLabel(null)).toBe('Situação: não autorizado.');
    expect(consentStatusLabel('2026-10-05T12:00:00Z')).toMatch(/^Situação: autorizado em \d{2}\/\d{2}\/\d{4}\.$/);
  });

  it('conceder só por escolha explícita e devolve o estado confirmado pelo servidor', async () => {
    const api = fakeApi(null);
    await expect(setAiConsent(api, true)).resolves.toEqual({ aiDataProcessingConsentAt: '2026-10-05T12:00:00Z' });
    expect(api.calls).toEqual(['accept', 'get']);
  });

  it('revogar chama a API de revogação e confirma o estado', async () => {
    const api = fakeApi('2026-10-05T12:00:00Z');
    await expect(setAiConsent(api, false)).resolves.toEqual({ aiDataProcessingConsentAt: null });
    expect(api.calls).toEqual(['revoke', 'get']);
  });

  it('descrição dos recursos espelha a política do servidor: só a organização de treino dispensa o consentimento', () => {
    expect(AI_FEATURES.filter((f) => !f.requiresConsent).map((f) => f.name)).toEqual(['Organização de treino pelo seu profissional']);
    expect(AI_FEATURES.filter((f) => f.requiresConsent)).toHaveLength(2);
  });
});
