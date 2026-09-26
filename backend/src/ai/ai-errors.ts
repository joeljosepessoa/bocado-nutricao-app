/**
 * Saída do provedor chegou, mas é inutilizável (JSON inválido, fora do
 * schema, truncada). A mensagem é escrita por nós e segura para o
 * profissional ver — vira `invalid_output` no AiInteractionLog.
 */
export class AiOutputValidationError extends Error {}

/** A funcionalidade exige saída estruturada e o provedor ativo não a oferece (ex.: mock-local). */
export class AiUnsupportedProviderError extends Error {
  constructor() {
    super('Este recurso exige um provedor de IA real configurado no servidor (AI_PROVIDER=anthropic).');
  }
}

export type AiProviderErrorKind =
  | 'missing_api_key'
  | 'invalid_provider'
  | 'provider_not_implemented'
  | 'invalid_model'
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'bad_request'
  | 'invalid_response'
  | 'refused'
  | 'network';

// Mensagens fixas, escritas por nós: nunca carregam chave, header, prompt ou
// texto livre devolvido pelo provedor.
const MESSAGES: Record<AiProviderErrorKind, string> = {
  missing_api_key: 'Provedor de IA sem credencial configurada no servidor.',
  invalid_provider: 'O provedor de IA configurado no servidor é inválido.',
  provider_not_implemented: 'O provedor de IA configurado ainda não está disponível nesta versão.',
  invalid_model: 'O modelo de IA configurado no servidor não existe ou não está disponível.',
  authentication: 'Falha de autenticação com o provedor de IA — verifique a credencial configurada no servidor.',
  rate_limited: 'Limite de uso do provedor de IA atingido. Tente novamente em instantes.',
  timeout: 'O provedor de IA não respondeu a tempo.',
  unavailable: 'O provedor de IA está temporariamente indisponível. Tente novamente em instantes.',
  bad_request: 'O provedor de IA recusou a solicitação.',
  invalid_response: 'O provedor de IA devolveu uma resposta inválida.',
  refused: 'O provedor de IA recusou gerar este conteúdo.',
  network: 'Não foi possível contatar o provedor de IA.',
};

// Só falhas transitórias valem nova tentativa; credencial/modelo/pedido errados não.
const RETRYABLE: ReadonlySet<AiProviderErrorKind> = new Set(['rate_limited', 'timeout', 'unavailable', 'network']);

/** Falha de provedor em formato controlado — qualquer provedor (Anthropic, OpenAI, Gemini) traduz para isto. */
export class AiProviderError extends Error {
  readonly retryable: boolean;

  constructor(readonly kind: AiProviderErrorKind) {
    super(MESSAGES[kind]);
    this.retryable = RETRYABLE.has(kind);
  }
}
