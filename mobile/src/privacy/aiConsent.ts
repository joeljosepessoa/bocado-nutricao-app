/**
 * Consentimento de IA da própria cliente — lógica única usada pela tela
 * Privacidade e dados e pelo "Concordar e continuar" da Evolução. Função pura
 * (sem react-native) para ser testável em Jest/node.
 *
 * Espelha a política por recurso do backend (backend/src/ai/ai-consent-policy.ts):
 * quem decide de verdade é o servidor; aqui é só a descrição transparente.
 */

export interface AiFeatureDescription {
  name: string;
  data: string;
  requiresConsent: boolean;
}

export const AI_FEATURES: readonly AiFeatureDescription[] = [
  {
    name: 'Explicação da avaliação física e resumo da sua evolução (neste aplicativo)',
    data: 'Usa dados das suas avaliações liberadas, como peso e composição corporal.',
    requiresConsent: true,
  },
  {
    name: 'Rascunho de anotações pelo seu profissional',
    data: 'Usa seu primeiro nome e as instruções escritas pelo profissional.',
    requiresConsent: true,
  },
  {
    name: 'Organização de treino pelo seu profissional',
    data: 'Usa apenas o texto de treino escrito pelo profissional — nada do seu cadastro, avaliações ou dieta.',
    requiresConsent: false,
  },
];

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
