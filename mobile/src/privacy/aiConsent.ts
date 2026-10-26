/**
 * Autorização opcional das "análises automáticas" (consentimento de IA da própria cliente) —
 * lógica única usada pela tela Privacidade e dados e pelo "Ativar e continuar" da Evolução.
 * Função pura (sem react-native) para ser testável em Jest/node.
 *
 * Quem decide por recurso é o servidor (backend/src/ai/ai-consent-policy.ts). Para o paciente o
 * texto fala em "análises automáticas"; a transparência fica na Política de Privacidade.
 */

export interface AiConsentApi {
  getAiConsent(): Promise<{ aiDataProcessingConsentAt: string | null }>;
  acceptAiConsent(): Promise<void>;
  revokeAiConsent(): Promise<void>;
}

export function isConsentGranted(state: { aiDataProcessingConsentAt: string | null } | null | undefined): boolean {
  return !!state?.aiDataProcessingConsentAt;
}

export function consentStatusLabel(consentedAt: string | null): string {
  if (!consentedAt) return 'Situação: não autorizado.';
  return `Situação: autorizado em ${new Date(consentedAt).toLocaleDateString('pt-BR')}.`;
}

/**
 * Concede (só com escolha explícita) ou revoga e devolve o estado confirmado
 * pelo servidor. Abrir a tela nunca concede nada.
 */
export async function setAiConsent(api: AiConsentApi, granted: boolean): Promise<{ aiDataProcessingConsentAt: string | null }> {
  if (granted) {
    await api.acceptAiConsent();
  } else {
    await api.revokeAiConsent();
  }
  return api.getAiConsent();
}
