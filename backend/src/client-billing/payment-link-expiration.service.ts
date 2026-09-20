import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentLinksService } from './payment-links.service';

/**
 * Job de expiração automática de PaymentLinks (Fase 23.6) — mesmo padrão
 * de BillingCycleService/AppointmentReminderService: @nestjs/schedule,
 * método público chamável direto pelos testes sem esperar o relógio.
 * A regra de expiração (e a auditoria) vive só em
 * `PaymentLinksService.markExpired()`; aqui é apenas o agendamento.
 * Deliberadamente sem dependência de gateway: expirar um link é uma
 * decisão puramente local.
 */
@Injectable()
export class PaymentLinkExpirationService {
  private readonly logger = new Logger(PaymentLinkExpirationService.name);

  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireDueLinks(): Promise<number> {
    try {
      const expired = await this.paymentLinks.markExpired();
      if (expired > 0) {
        this.logger.log(`${expired} link(s) de pagamento expirado(s).`);
      }
      return expired;
    } catch (err) {
      this.logger.error('Falha ao expirar links de pagamento', err as Error);
      return 0;
    }
  }
}
