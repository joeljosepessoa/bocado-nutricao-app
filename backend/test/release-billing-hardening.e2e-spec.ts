import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentGatewayService } from '../src/billing/gateway/payment-gateway.service';
import { MockPaymentGatewayService } from '../src/billing/gateway/mock-payment-gateway.service';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();
const WEBHOOK_SECRET = 'test-mercadopago-webhook-secret-e2e';

function xSignature(dataId: string, requestId: string): string {
  const ts = String(Date.now());
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex')}`;
}

describe('Cobrança: cancelamento real, exclusão de conta e webhook de link recorrente (release hardening)', () => {
  let app: INestApplication;
  let gateway: MockPaymentGatewayService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gateway = moduleRef.get(PaymentGatewayService) as unknown as MockPaymentGatewayService;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setupRecurring() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const product = (
      await request(app.getHttpServer())
        .post('/professionals/me/products')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ name: 'Mensal', priceCents: 9_900, billingType: 'recurring', recurrenceInterval: 'month' })
        .expect(201)
    ).body;
    const link = (
      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201)
    ).body;
    const subscription = await prisma.clientSubscription.create({
      data: {
        professionalId: professional.user.id,
        clientId: client.id,
        professionalProductId: product.id,
        paymentLinkId: link.id,
        status: 'authorized',
        externalSubscriptionId: link.externalSubscriptionId,
      },
    });
    return { professional, client, temporaryPassword, link, subscription };
  }

  it('cancelar a assinatura chama o gateway com o externalSubscriptionId e só então marca cancelAtPeriodEnd', async () => {
    const { professional, subscription } = await setupRecurring();
    const spy = jest.spyOn(gateway, 'cancelRecurringSubscription');

    const res = await request(app.getHttpServer())
      .post(`/professionals/me/client-subscriptions/${subscription.id}/cancel`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(spy).toHaveBeenCalledWith(subscription.externalSubscriptionId);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
  });

  it('se o gateway recusar o cancelamento, o estado local NÃO muda e nada é auditado', async () => {
    const { professional, subscription } = await setupRecurring();
    jest.spyOn(gateway, 'cancelRecurringSubscription').mockRejectedValueOnce(new Error('gateway indisponível'));

    await request(app.getHttpServer())
      .post(`/professionals/me/client-subscriptions/${subscription.id}/cancel`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(500);

    const after = await prisma.clientSubscription.findUnique({ where: { id: subscription.id } });
    expect(after?.cancelAtPeriodEnd).toBe(false);
    const audits = await prisma.clientBillingAuditLog.count({
      where: { clientSubscriptionId: subscription.id, action: 'subscription_canceled' },
    });
    expect(audits).toBe(0);
  });

  it('exclusão de conta do cliente cancela a assinatura ativa no gateway e depois anonimiza', async () => {
    const { client, temporaryPassword, subscription } = await setupRecurring();
    const session = await login(app, client.user.email, temporaryPassword);
    const spy = jest.spyOn(gateway, 'cancelRecurringSubscription');

    await request(app.getHttpServer())
      .post('/client/account-deletion')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: temporaryPassword })
      .expect(204);

    expect(spy).toHaveBeenCalledWith(subscription.externalSubscriptionId);
    const user = await prisma.user.findUnique({ where: { id: client.id } });
    expect(user?.anonymizedAt).not.toBeNull();
  });

  it('exclusão de conta é ABORTADA se o gateway recusar cancelar — nada é anonimizado (sem cobrança órfã)', async () => {
    const { client, temporaryPassword } = await setupRecurring();
    const session = await login(app, client.user.email, temporaryPassword);
    jest.spyOn(gateway, 'cancelRecurringSubscription').mockRejectedValueOnce(new Error('gateway indisponível'));

    await request(app.getHttpServer())
      .post('/client/account-deletion')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: temporaryPassword })
      .expect(500);

    const user = await prisma.user.findUnique({ where: { id: client.id } });
    expect(user?.anonymizedAt).toBeNull();
    expect(await prisma.accountDeletionRequest.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('webhook "payment" cujo external_reference é de um link RECORRENTE é ignorado: sem fatura e link continua "created"', async () => {
    const { link } = await setupRecurring();
    const paymentId = `mock_pref_${randomUUID()}`;
    gateway.registerMockResource(paymentId, { externalReference: link.id, status: 'approved', amountCents: 9_900 });
    const requestId = `req-${randomUUID()}`;

    await request(app.getHttpServer())
      .post(`/client-billing/webhook?data.id=${paymentId}&type=payment`)
      .set('x-signature', xSignature(paymentId, requestId))
      .set('x-request-id', requestId)
      .send({ action: 'payment.updated', data: { id: paymentId } })
      .expect(200);

    expect(await prisma.clientInvoice.count({ where: { externalPaymentId: paymentId } })).toBe(0);
    const after = await prisma.paymentLink.findUnique({ where: { id: link.id } });
    expect(after?.status).toBe('created');
  });

  it('a grafia "canceled" (documentação) também é lida como cancelamento vindo do gateway', async () => {
    const { subscription } = await setupRecurring();
    gateway.simulateStatusChange(subscription.externalSubscriptionId, 'canceled');
    const requestId = `req-${randomUUID()}`;

    await request(app.getHttpServer())
      .post(`/client-billing/webhook?data.id=${subscription.externalSubscriptionId}&type=subscription_preapproval`)
      .set('x-signature', xSignature(subscription.externalSubscriptionId, requestId))
      .set('x-request-id', requestId)
      .send({ data: { id: subscription.externalSubscriptionId } })
      .expect(200);

    const after = await prisma.clientSubscription.findUnique({ where: { id: subscription.id } });
    expect(after?.status).toBe('cancelled');
  });
});
