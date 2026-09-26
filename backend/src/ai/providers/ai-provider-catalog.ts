/**
 * Catálogo ÚNICO de provedores de IA: id, nome de exibição, se já está
 * implementado, de quais variáveis de ambiente vêm credencial e modelo, e o
 * modelo padrão. Registry (escolha em runtime), resolvedor de credenciais e
 * checagem de boot leem daqui — é o único lugar com nome de modelo padrão.
 * Uma futura tela "Configuração da IA" também lista a partir daqui.
 */
export const AI_PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'mock-local'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderDescriptor {
  id: AiProviderId;
  label: string;
  /** `planned`: previsto na arquitetura, sem implementação — selecioná-lo é erro controlado. */
  status: 'available' | 'planned';
  /** Variáveis de ENV do BACKEND. Ausente = provedor sem credencial (mock-local). */
  env?: { apiKey: string; model: string; baseUrl?: string };
  /** Usado quando a variável de modelo não é definida. Ausente = o modelo precisa ser configurado. */
  defaultModel?: string;
}

export const AI_PROVIDERS: Readonly<Record<AiProviderId, AiProviderDescriptor>> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic — Claude',
    status: 'available',
    env: { apiKey: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL', baseUrl: 'ANTHROPIC_BASE_URL' },
    // Fase inicial: priorizar velocidade e custo (Claude Haiku 4.5).
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI — GPT',
    status: 'planned',
    env: { apiKey: 'OPENAI_API_KEY', model: 'OPENAI_MODEL' },
  },
  gemini: {
    id: 'gemini',
    label: 'Google — Gemini',
    status: 'planned',
    env: { apiKey: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
  },
  'mock-local': {
    id: 'mock-local',
    label: 'Mock Local — testes',
    status: 'available',
  },
};

/** Padrão em dev, testes e CI — nenhuma chamada externa. */
export const DEFAULT_AI_PROVIDER: AiProviderId = 'mock-local';

// `claude` foi o id da primeira versão do provedor Anthropic; segue aceito.
const ALIASES: Readonly<Record<string, AiProviderId>> = { claude: 'anthropic' };

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export type AiProviderResolution =
  | { kind: 'available'; id: AiProviderId }
  | { kind: 'planned'; id: AiProviderId }
  | { kind: 'unknown'; raw: string };

export function resolveAiProviderId(raw: string | undefined): AiProviderResolution {
  const value = (raw ?? '').trim().toLowerCase() || DEFAULT_AI_PROVIDER;
  const id = ALIASES[value] ?? value;
  if (!isAiProviderId(id)) {
    return { kind: 'unknown', raw: value.slice(0, 40) };
  }
  return AI_PROVIDERS[id].status === 'planned' ? { kind: 'planned', id } : { kind: 'available', id };
}
