import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { CronExpression } from '@nestjs/schedule';
import { ClientSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from '../billing/gateway/payment-gateway.service';
import { ClientSubscriptionsService } from './client-subscriptions.service';
import { ClientSubscriptionReconciliationService } from './client-subscription-reconciliation.service';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: ClientSubscriptionStatus.authorized,
    externalSubscriptionId: 'ext-1',
    paymentLinkId: 'link-1',
    ...overrides,
  };
}

function build(options: {
  rows?: unknown[];
  getRecurringSubscription?: jest.Mock;
  applyGatewayStatus?: jest.Mock;
}) {
  const findMany = jest.fn().mockResolvedValue(options.rows ?? []);
  const getRecurringSubscription =
    options.getRecurringSubscription ??
    jest.fn().mockResolvedValue({ externalId: 'ext-1', status: 'authorized', externalReference: 'link-1' });
  const applyGatewayStatus = options.applyGatewayStatus ?? jest.fn().mockResolvedValue({ outcome: 'unchanged' });
  const service = new ClientSubscriptionReconciliationService(
    { clientSubscription: { findMany } } as unknown as PrismaService,
    { getRecurringSubscription } as unknown as PaymentGatewayService,
    { applyGatewayStatus } as unknown as ClientSubscriptionsService,
  );
  return { service, findMany, getRecurringSubscription, applyGatewayStatus };
}

describe('ClientSubscriptionReconciliationService (Fase 23.6 — item 2, sem banco/rede)', () => {
  it('está registrado como cron de 1 vez por hora (@nestjs/schedule)', () => {
    const options = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      ClientSubscriptionReconciliationService.prototype.reconcileSubscriptions,
    );
    expect(options.cronTime).toBe(CronExpression.EVERY_HOUR);
  });

  it('só seleciona estados não terminais (pending/authorized/paused) — nunca cancelled', async () => {
    const { service, findMany } = build({});
    await service.reconcileSubscriptions();

    const where = findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(
      expect.arrayContaining([ClientSubscriptionStatus.pending, ClientSubscriptionStatus.authorized, ClientSubscriptionStatus.paused]),
    );
    expect(where.status.in).not.toContain(ClientSubscriptionStatus.cancelled);
  });

  it('8. consulta o gateway pela interface PaymentGatewayService com o externalSubscriptionId local', async () => {
    const { service, getRecurringSubscription } = build({ rows: [subscription()] });
    await service.reconcileSubscriptions();
    expect(getRecurringSubscription).toHaveBeenCalledWith('ext-1');
  });

  it('9. registro sem externalSubscriptionId não é consultado', async () => {
    const { service, getRecurringSubscription, applyGatewayStatus } = build({
      rows: [subscription({ externalSubscriptionId: '' }), subscription({ externalSubscriptionId: null })],
    });
    const summary = await service.reconcileSubscriptions();

    expect(getRecurringSubscription).not.toHaveBeenCalled();
    expect(applyGatewayStatus).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(2);
  });

  it('repassa o status do gateway + lock otimista (status local lido) para a lógica compartilhada', async () => {
    const applyGatewayStatus = jest.fn().mockResolvedValue({ outcome: 'applied' });
    const { service } = build({
      rows: [subscription({ status: ClientSubscriptionStatus.paused })],
      getRecurringSubscription: jest.fn().mockResolvedValue({ externalId: 'ext-1', status: 'authorized', externalReference: 'link-1' }),
      applyGatewayStatus,
    });
    const summary = await service.reconcileSubscriptions();

    expect(applyGatewayStatus).toHaveBeenCalledWith({
      externalSubscriptionId: 'ext-1',
      gatewayStatus: 'authorized',
      source: 'reconciliation',
      expectedLocalStatus: ClientSubscriptionStatus.paused,
    });
    expect(summary.applied).toBe(1);
  });

  it('14. erro do gateway não chama a lógica de transição, não derruba o lote e é contabilizado', async () => {
    const getRecurringSubscription = jest
      .fn()
      .mockRejectedValueOnce(new Error('Mercado Pago indisponível'))
      .mockResolvedValueOnce({ externalId: 'ext-2', status: 'paused', externalReference: 'link-2' });
    const applyGatewayStatus = jest.fn().mockResolvedValue({ outcome: 'applied' });
    const { service } = build({
      rows: [subscription(), subscription({ id: 'sub-2', externalSubscriptionId: 'ext-2', paymentLinkId: 'link-2' })],
      getRecurringSubscription,
      applyGatewayStatus,
    });

    const summary = await service.reconcileSubscriptions();

    expect(summary.failed).toBe(1);
    expect(summary.applied).toBe(1);
    expect(applyGatewayStatus).toHaveBeenCalledTimes(1);
    expect(applyGatewayStatus.mock.calls[0][0].externalSubscriptionId).toBe('ext-2');
  });

  it('resposta do gateway com external_reference diferente do NOSSO link é ignorada (sem transição)', async () => {
    const { service, applyGatewayStatus } = build({
      rows: [subscription()],
      getRecurringSubscription: jest.fn().mockResolvedValue({ externalId: 'ext-1', status: 'cancelled', externalReference: 'outro-link' }),
    });
    const summary = await service.reconcileSubscriptions();

    expect(applyGatewayStatus).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it('resposta do gateway com outro id de recurso é ignorada (sem transição)', async () => {
    const { service, applyGatewayStatus } = build({
      rows: [subscription()],
      getRecurringSubscription: jest.fn().mockResolvedValue({ externalId: 'ext-DIFERENTE', status: 'cancelled', externalReference: 'link-1' }),
    });
    await service.reconcileSubscriptions();
    expect(applyGatewayStatus).not.toHaveBeenCalled();
  });

  it('falha ao listar candidatos é logada e devolve resumo vazio (não lança)', async () => {
    const { service, findMany } = build({});
    findMany.mockRejectedValue(new Error('db fora do ar'));
    await expect(service.reconcileSubscriptions()).resolves.toEqual({ checked: 0, applied: 0, unchanged: 0, skipped: 0, failed: 0 });
  });
});
