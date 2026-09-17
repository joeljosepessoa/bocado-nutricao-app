import { Injectable, Logger } from '@nestjs/common';
import { ErrorTrackingService } from './error-tracking.service';

/**
 * Adapter padrão — só loga (via Logger padrão, respeitando o formato
 * estruturado configurado em main.ts). Usado quando ERROR_TRACKING_PROVIDER
 * não é "sentry", inclusive em dev/teste.
 */
@Injectable()
export class ConsoleErrorTrackingService extends ErrorTrackingService {
  private readonly logger = new Logger('ErrorTracking');

  captureException(error: unknown, context?: Record<string, unknown>): void {
    const stack = error instanceof Error ? error.stack : String(error);
    this.logger.error(context ? `${stack} ${JSON.stringify(context)}` : stack);
  }
}
