/**
 * Abstração de rastreamento de erro — mesmo padrão de EmailService (Fase 13)
 * e StorageService (Fase 9): o domínio (aqui, o AllExceptionsFilter) depende
 * só desta interface, nunca de um provedor concreto.
 */
export abstract class ErrorTrackingService {
  abstract captureException(error: unknown, context?: Record<string, unknown>): void;
}
