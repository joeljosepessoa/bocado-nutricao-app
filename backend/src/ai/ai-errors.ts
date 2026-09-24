/**
 * Saída do provedor chegou, mas é inutilizável (JSON inválido, fora do
 * schema, truncada). A mensagem é escrita por nós e segura para o
 * profissional ver — vira `invalid_output` no AiInteractionLog.
 */
export class AiOutputValidationError extends Error {}

/** A funcionalidade exige saída estruturada e o provedor ativo não a oferece (ex.: mock-local). */
export class AiUnsupportedProviderError extends Error {
  constructor() {
    super('Este recurso exige um provedor de IA real configurado no servidor (AI_PROVIDER=claude).');
  }
}
