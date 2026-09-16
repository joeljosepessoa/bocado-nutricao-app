import { AiFeatureKey } from '@prisma/client';

export interface AiContextResult {
  systemPrompt: string;
  /** Só o que esta feature especificamente libera — nunca um objeto genérico "cliente inteiro". */
  context: Record<string, unknown>;
  /** Id da entidade referenciada (ex.: evaluationId), quando fizer sentido para a feature. */
  contextRef?: string;
}

export interface BuildContextParams {
  professionalId: string;
  clientId: string;
  input: unknown;
}

/**
 * Um Use Case por funcionalidade aprovada (Fase 12, decisão 14). Cada um
 * decide sozinho o que é permitido entrar no contexto — a autorização de
 * "este profissional pode agir sobre este cliente" já aconteceu antes,
 * em AiService; o que cada use case acrescenta é a checagem e a
 * minimização específicas da sua própria feature (ex.: avaliação liberada).
 */
export interface AiUseCase {
  readonly feature: AiFeatureKey;
  readonly promptVersion: string;
  buildContext(params: BuildContextParams): Promise<AiContextResult>;
}
