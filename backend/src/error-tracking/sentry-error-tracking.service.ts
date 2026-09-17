import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { ErrorTrackingService } from './error-tracking.service';

/**
 * Adapter real do Sentry (SDK oficial @sentry/node) — nenhum DSN é
 * fabricado aqui. Sem SENTRY_DSN configurado, `Sentry.init` roda em modo
 * inerte (comportamento documentado do próprio SDK: sem DSN, não há para
 * onde enviar, e as chamadas de captura viram no-op) — não é um mock
 * nosso, é o próprio pacote se comportando assim por padrão. Só é
 * instanciado (e só então chama Sentry.init) quando
 * ERROR_TRACKING_PROVIDER=sentry — ver error-tracking.module.ts.
 */
@Injectable()
export class SentryErrorTrackingService extends ErrorTrackingService {
  constructor(config: ConfigService) {
    super();
    Sentry.init({
      dsn: config.get<string>('SENTRY_DSN') || undefined,
      environment: config.get<string>('NODE_ENV') ?? 'development',
    });
  }

  captureException(error: unknown, context?: Record<string, unknown>): void {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}
