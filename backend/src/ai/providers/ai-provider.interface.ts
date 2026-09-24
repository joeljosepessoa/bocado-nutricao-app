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
}

export interface AiGenerationResult {
  text: string;
  model: string;
  tokensUsed?: { input: number; output: number };
  providerRequestId?: string;
  /** O provedor parou por limite de saída — o texto está incompleto. */
  truncated?: boolean;
}

export interface AiProvider {
  readonly id: string;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}
