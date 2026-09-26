/**
 * Único ponto de contato com um provedor de IA — nenhuma outra camada fala
 * com um SDK/API de IA diretamente (Fase 12, decisão 5 e 14). Mesmo padrão
 * de abstração já usado em ScaleDriver (Fase 10) e StorageService (Fase 9):
 * a aplicação depende desta interface, nunca de um fornecedor concreto.
 */
export interface AiGenerationRequest {
  promptVersion: string;
  systemPrompt: string;
  /** Só o que o Context Builder do use case liberou — nunca uma consulta livre ao banco. */
  context: Record<string, unknown>;
  maxOutputChars: number;
  /** JSON Schema da resposta — provedores com saída estruturada o impõem; os demais ignoram. */
  responseSchema?: Record<string, unknown>;
  /** Abortado quando o pipeline desiste da tentativa (timeout) — provedores de rede devem cancelar a chamada. */
  signal?: AbortSignal;
}

export interface AiGenerationResult {
  text: string;
  model: string;
  tokensUsed?: { input: number; output: number };
  providerRequestId?: string;
  /** O provedor parou por limite de saída — o texto está incompleto. */
  truncated?: boolean;
}

/**
 * Credencial de UMA chamada, entregue pelo AiCredentialsResolver (hoje: ENV
 * do servidor). Nunca é logada, persistida nem devolvida em resposta.
 */
export interface AiProviderCredentials {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Contrato comum a todos os provedores (mock-local, Anthropic e, no futuro,
 * OpenAI/Gemini). Falhas saem SEMPRE como AiProviderError; a saída é sempre
 * AiGenerationResult — o resto do sistema não sabe qual provedor respondeu.
 */
export interface AiProvider {
  readonly id: string;
  /** Segue instruções de formato (ex.: "responda só JSON") — o mock local não. */
  readonly supportsStructuredOutput?: boolean;
  generate(request: AiGenerationRequest, credentials?: AiProviderCredentials): Promise<AiGenerationResult>;
}
