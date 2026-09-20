import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { CronExpression } from '@nestjs/schedule';
import { PaymentLinkExpirationService } from './payment-link-expiration.service';
import { PaymentLinksService } from './payment-links.service';

function build(markExpired: jest.Mock) {
  const links = { markExpired } as unknown as PaymentLinksService;
  return new PaymentLinkExpirationService(links);
}

describe('PaymentLinkExpirationService (Fase 23.6 — item 1)', () => {
  it('1. o cron chama PaymentLinksService.markExpired() e devolve a contagem', async () => {
    const markExpired = jest.fn().mockResolvedValue(3);
    const service = build(markExpired);

    await expect(service.expireDueLinks()).resolves.toBe(3);
    expect(markExpired).toHaveBeenCalledTimes(1);
  });

  it('2. o método é público e executável diretamente (sem esperar o relógio)', async () => {
    const service = build(jest.fn().mockResolvedValue(0));
    expect(typeof service.expireDueLinks).toBe('function');
    await expect(service.expireDueLinks()).resolves.toBe(0);
  });

  it('está registrado como cron de 1 vez por hora (@nestjs/schedule)', () => {
    const options = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, PaymentLinkExpirationService.prototype.expireDueLinks);
    expect(options).toBeDefined();
    expect(options.cronTime).toBe(CronExpression.EVERY_HOUR);
  });

  it('4. não depende de gateway: o construtor só recebe PaymentLinksService', () => {
    // Uma única dependência injetável — não há como o cron de expiração
    // alcançar o Mercado Pago.
    expect(PaymentLinkExpirationService.length).toBe(1);
  });

  it('erro em markExpired é logado e não derruba o processo (próxima execução tenta de novo)', async () => {
    const service = build(jest.fn().mockRejectedValue(new Error('db fora do ar')));
    await expect(service.expireDueLinks()).resolves.toBe(0);
  });
});
