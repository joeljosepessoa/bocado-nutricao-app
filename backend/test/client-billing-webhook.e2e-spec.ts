import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentGatewayService } from '../src/billing/gateway/payment-gateway.service';
import { MockPaymentGatewayService } from '../src/billing/gateway/mock-payment-gateway.service';
import { registerProfessional, createClient } from './helpers';

const prisma = new PrismaClient();

// Mesmo valor configurado em test/jest-e2e.setup.js — deliberadamente só
// para teste, nunca um secret real do Mercado Pago.
const WEBHOOK_SECRET = 'test-mercadopago-webhook-secret-e2e';

function signManifest(dataId: string, requestId: string | undefined, ts: string): string {
  const parts = [`id:${dataId.toLowerCase()}`];
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  const manifest = `${parts.join(';')};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

async function createProduct(app: INestApplication, accessToken: string, overrides: Record<string, unknown> = {}) {
  const payload = { name: 'Acompanhamento', priceCents: 19_900, billingType: 'one_time', ...overrides };
  const res = await request(app.getHttpServer())
    .post('/professionals/me/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(payload)
    .expect(201);
  return res.body;
}

async function createPaymentLink(app: INestApplication, accessToken: string, clientId: string, productId: string) {
  const res = await request(app.getHttpServer())
    .post('/professionals/me/payment-links')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ clientId, professionalProductId: productId })
    .expect(201);
  return res.body;
}

describe('Webhook do Mercado Pago — comercial cliente (e2e — Fase 23.5)', () => {
  let app: INestApplication;
  let gateway: MockPaymentGatewayService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // PAYMENT_GATEWAY_PROVIDER não configurado em .env de teste -> default
    // "mock" (BillingModule) -> a instância por trás do token abstrato é
    // sempre MockPaymentGatewayService aqui.
    gateway = moduleRef.get(PaymentGatewayService) as unknown as MockPaymentGatewayService;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    return { professional, client };
  }

  function postWebhook(params: { dataId?: string; type?: string; requestId?: string; xSignature?: string; body?: Record<string, unknown> }) {
    const query: string[] = [];
    if (params.dataId !== undefined) query.push(`data.id=${encodeURIComponent(params.dataId)}`);
    if (params.type !== undefined) query.push(`type=${encodeURIComponent(params.type)}`);
    const req = request(app.getHttpServer()).post(`/client-billing/webhook?${query.join('&')}`);
    if (params.xSignature !== undefined) req.set('x-signature', params.xSignature);
    if (params.requestId !== undefined) req.set('x-request-id', params.requestId);
    return req.send(params.body ?? { action: 'payment.updated', data: { id: params.dataId } });
  }

  function postSignedWebhook(params: { dataId: string; type: string; requestId?: string; body?: Record<string, unknown> }) {
    const ts = String(Date.now());
    const requestId = params.requestId ?? `req-${randomUUID()}`;
    const xSignature = signManifest(params.dataId, requestId, ts);
    return postWebhook({ dataId: params.dataId, type: params.type, requestId, xSignature, body: params.body });
  }

  // -------------------------------------------------------------------
  // ASSINATURA (1-8)
  // -------------------------------------------------------------------

  describe('Validação de assinatura', () => {
    it('1. assinatura válida é aceita (200)', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      const res = await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('2. assinatura inválida (v1 forjado) é rejeitada com 400', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);

      const res = await postWebhook({
        dataId: link.externalPreferenceId,
        type: 'payment',
        requestId: 'req-1',
        xSignature: 'ts=1700000000000,v1=' + '0'.repeat(64),
      });
      expect(res.status).toBe(400);
    });

    it('3. sem header x-signature nenhum é rejeitado com 400', async () => {
      const res = await postWebhook({ dataId: 'algum-id', type: 'payment' });
      expect(res.status).toBe(400);
    });

    it('4. funciona sem x-request-id (opcional na especificação oficial)', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      const ts = String(Date.now());
      const xSignature = signManifest(link.externalPreferenceId, undefined, ts);
      const res = await postWebhook({ dataId: link.externalPreferenceId, type: 'payment', xSignature });
      expect(res.status).toBe(200);
    });

    it('5. sem data.id na query é rejeitado com 400', async () => {
      const ts = String(Date.now());
      const xSignature = `ts=${ts},v1=${'0'.repeat(64)}`;
      const res = await postWebhook({ type: 'payment', xSignature, requestId: 'req-1' });
      expect(res.status).toBe(400);
    });

    it('6. X-Signature malformado (sem ts=/v1=) é rejeitado com 400, não derruba o processo', async () => {
      const res = await postWebhook({ dataId: 'algum-id', type: 'payment', xSignature: 'lixo-total' });
      expect(res.status).toBe(400);
    });

    it('7. assinatura calculada com secret diferente é rejeitada, resposta idêntica à de assinatura ausente (sem vazar detalhe do motivo)', async () => {
      const forged = `ts=1700000000000,v1=${createHmac('sha256', 'outro-secret-qualquer').update('id:x;ts:1700000000000;').digest('hex')}`;
      const res = await postWebhook({ dataId: 'x', type: 'payment', requestId: undefined, xSignature: forged });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(WEBHOOK_SECRET);
      expect(JSON.stringify(res.body)).not.toContain('outro-secret-qualquer');
    });

    it('8. o secret de webhook nunca aparece em nenhuma resposta (sucesso ou falha)', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      const ok = await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' });
      expect(JSON.stringify(ok.body)).not.toContain(WEBHOOK_SECRET);

      const bad = await postWebhook({ dataId: 'x', type: 'payment', xSignature: 'ts=1,v1=ab' });
      expect(JSON.stringify(bad.body)).not.toContain(WEBHOOK_SECRET);
    });
  });

  // -------------------------------------------------------------------
  // PAGAMENTO (9-16)
  // -------------------------------------------------------------------

  describe('Processamento de pagamento único', () => {
    it('9. payment approved: fatura criada com status paid, link marcado paid', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice?.status).toBe('paid');
      expect(invoice?.paymentLinkId).toBe(link.id);
      expect(invoice?.amountCents).toBe(link.amountCents);

      const updatedLink = await prisma.paymentLink.findUnique({ where: { id: link.id } });
      expect(updatedLink?.status).toBe('paid');
    });

    it('10. payment rejected: fatura criada com status failed, link permanece created', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'rejected');

      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice?.status).toBe('failed');

      const updatedLink = await prisma.paymentLink.findUnique({ where: { id: link.id } });
      expect(updatedLink?.status).toBe('created');
    });

    it('11. nunca confia no status declarado no corpo do webhook — só no que a consulta ao gateway devolve', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      // Deliberadamente NÃO simulamos approved — o recurso mock continua "pending".
      // O corpo do webhook MENTE dizendo "approved", mas isso nunca é usado.

      await postWebhook({
        dataId: link.externalPreferenceId,
        type: 'payment',
        requestId: 'req-lie',
        xSignature: signManifest(link.externalPreferenceId, 'req-lie', String(Date.now())),
        body: { action: 'payment.updated', data: { id: link.externalPreferenceId, status: 'approved' } },
      }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice).toBeNull(); // status real (pending) é não-terminal -> nenhuma fatura criada

      const updatedLink = await prisma.paymentLink.findUnique({ where: { id: link.id } });
      expect(updatedLink?.status).toBe('created');
    });

    it('12. valor gravado na fatura é sempre o do nosso PaymentLink, nunca um valor vindo do payload/gateway', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken, { priceCents: 5_000 });
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      // O mock guarda amountCents=5000 (o mesmo enviado por createOneTimeCheckout),
      // mas mesmo que o gateway devolvesse outro valor, upsertByExternalPaymentId
      // usa link.amountCents (ver ClientBillingWebhookService.processPayment).
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      await postSignedWebhook({
        dataId: link.externalPreferenceId,
        type: 'payment',
        body: { action: 'payment.updated', data: { id: link.externalPreferenceId }, amount: 999_999 },
      }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice?.amountCents).toBe(5_000);
    });

    it('13. idempotência: mesmo data.id processado duas vezes não duplica a fatura', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);
      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);

      const count = await prisma.clientInvoice.count({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(count).toBe(1);
    });

    it('14. webhook repetido (reentrega) não duplica nem regride um status já terminal para outro', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');
      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);

      // Reentrega idêntica (mesmo status ainda "approved" no gateway).
      await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment' }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice?.status).toBe('paid');
      const count = await prisma.clientInvoice.count({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(count).toBe(1);
    });

    it('15. external_reference desconhecido nunca cria fatura nem PaymentLink', async () => {
      const unknownId = `mock_pref_${randomUUID()}`;
      gateway.registerMockResource(unknownId, { externalReference: 'referencia-que-nao-existe', status: 'approved', amountCents: 1000 });

      const res = await postSignedWebhook({ dataId: unknownId, type: 'payment' });
      expect(res.status).toBe(200); // evento autêntico, mas seguramente ignorado

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: unknownId } });
      expect(invoice).toBeNull();
      const linkCount = await prisma.paymentLink.count({ where: { externalPreferenceId: unknownId } });
      expect(linkCount).toBe(0);
    });

    it('16. dois webhooks concorrentes para o mesmo pagamento não duplicam a fatura', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      gateway.simulateStatusChange(link.externalPreferenceId, 'approved');

      const [r1, r2] = await Promise.all([
        postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment', requestId: 'req-a' }),
        postSignedWebhook({ dataId: link.externalPreferenceId, type: 'payment', requestId: 'req-b' }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const count = await prisma.clientInvoice.count({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(count).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // ASSINATURA RECORRENTE (17-21)
  // -------------------------------------------------------------------

  describe('Processamento de assinatura recorrente', () => {
    async function setupRecurring() {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken, {
        name: 'Acompanhamento mensal',
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);
      return { professional, client, product, link };
    }

    it('17. subscription_preapproval authorized: ClientSubscription criada, PaymentLink marcado converted', async () => {
      const { link } = await setupRecurring();
      gateway.simulateStatusChange(link.externalSubscriptionId, 'authorized');

      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      const subscription = await prisma.clientSubscription.findUnique({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(subscription?.status).toBe('authorized');
      expect(subscription?.paymentLinkId).toBe(link.id);

      const updatedLink = await prisma.paymentLink.findUnique({ where: { id: link.id } });
      expect(updatedLink?.status).toBe('converted');
    });

    it('18. authorized -> paused: MESMO externalSubscriptionId reportado como pausado em um webhook posterior', async () => {
      const { link } = await setupRecurring();
      gateway.simulateStatusChange(link.externalSubscriptionId, 'authorized');
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      gateway.simulateStatusChange(link.externalSubscriptionId, 'paused');
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      const subscription = await prisma.clientSubscription.findUnique({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(subscription?.status).toBe('paused');
    });

    it('19. authorized -> paused -> cancelled: MESMO id evolui por três webhooks sucessivos', async () => {
      const { link } = await setupRecurring();
      gateway.simulateStatusChange(link.externalSubscriptionId, 'authorized');
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      gateway.simulateStatusChange(link.externalSubscriptionId, 'paused');
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      gateway.simulateStatusChange(link.externalSubscriptionId, 'cancelled');
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' }).expect(200);

      const subscription = await prisma.clientSubscription.findUnique({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(subscription?.status).toBe('cancelled');
      expect(subscription?.canceledAt).not.toBeNull();

      const count = await prisma.clientSubscription.count({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(count).toBe(1); // uma linha só, nunca uma nova por transição
    });

    it('20. externalSubscriptionId garante idempotência: webhook "authorized" repetido não duplica a assinatura', async () => {
      const { link } = await setupRecurring();
      gateway.simulateStatusChange(link.externalSubscriptionId, 'authorized');

      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval', requestId: 'req-1' }).expect(200);
      await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval', requestId: 'req-2' }).expect(200);

      const count = await prisma.clientSubscription.count({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(count).toBe(1);
    });

    it('21. webhook "paused" para uma assinatura nunca autorizada não cria ClientSubscription nenhuma', async () => {
      const { link } = await setupRecurring();
      // Nunca chega a "authorized" — pula direto para "paused".
      gateway.simulateStatusChange(link.externalSubscriptionId, 'paused');

      const res = await postSignedWebhook({ dataId: link.externalSubscriptionId, type: 'subscription_preapproval' });
      expect(res.status).toBe(200); // autêntico, mas seguramente ignorado

      const subscription = await prisma.clientSubscription.findUnique({ where: { externalSubscriptionId: link.externalSubscriptionId } });
      expect(subscription).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // SEGURANÇA (22-25)
  // -------------------------------------------------------------------

  describe('Segurança e isolamento', () => {
    it('22. clientId/professionalId/amount forjados no corpo do webhook são ignorados — sempre vêm do PaymentLink real', async () => {
      const a = await setup();
      const productA = await createProduct(app, a.professional.accessToken, { priceCents: 12_345 });
      const linkA = await createPaymentLink(app, a.professional.accessToken, a.client.id, productA.id);
      gateway.simulateStatusChange(linkA.externalPreferenceId, 'approved');

      const b = await setup(); // profissional/cliente completamente diferentes, usados só para forjar IDs no payload

      await postWebhook({
        dataId: linkA.externalPreferenceId,
        type: 'payment',
        requestId: 'req-forged',
        xSignature: signManifest(linkA.externalPreferenceId, 'req-forged', String(Date.now())),
        body: {
          action: 'payment.updated',
          data: { id: linkA.externalPreferenceId },
          // Campos forjados — nenhum deles existe no contrato real do
          // Mercado Pago para este evento, e mesmo que existissem, o
          // ClientBillingWebhookService nunca os lê.
          professional_id: b.professional.user.id,
          client_id: b.client.id,
          amount: 1,
        },
      }).expect(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: linkA.externalPreferenceId } });
      expect(invoice?.professionalId).toBe(a.professional.user.id);
      expect(invoice?.clientId).toBe(a.client.id);
      expect(invoice?.amountCents).toBe(12_345);
    });

    it('23. external_reference desconhecido nunca cria PaymentLink/ClientSubscription/ClientInvoice novos (pagamento e assinatura)', async () => {
      const unknownPaymentId = `mock_pref_${randomUUID()}`;
      gateway.registerMockResource(unknownPaymentId, { externalReference: randomUUID(), status: 'approved' });
      await postSignedWebhook({ dataId: unknownPaymentId, type: 'payment' }).expect(200);
      expect(await prisma.clientInvoice.count({ where: { externalPaymentId: unknownPaymentId } })).toBe(0);

      const unknownSubscriptionId = `mock_preapproval_${randomUUID()}`;
      gateway.registerMockResource(unknownSubscriptionId, { externalReference: randomUUID(), status: 'authorized' });
      await postSignedWebhook({ dataId: unknownSubscriptionId, type: 'subscription_preapproval' }).expect(200);
      expect(await prisma.clientSubscription.count({ where: { externalSubscriptionId: unknownSubscriptionId } })).toBe(0);
    });

    it('24. resposta de erro nunca inclui o header x-signature recebido nem qualquer segredo', async () => {
      const res = await postWebhook({ dataId: 'x', type: 'payment', xSignature: 'ts=1,v1=deadbeef' });
      expect(res.status).toBe(400);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('deadbeef');
      expect(serialized).not.toContain(WEBHOOK_SECRET);
    });

    it('25. tópico autêntico não tratado (ex.: subscription_authorized_payment) é aceito (200) sem aplicar nenhuma transição', async () => {
      const { professional, client } = await setup();
      const product = await createProduct(app, professional.accessToken);
      const link = await createPaymentLink(app, professional.accessToken, client.id, product.id);

      const res = await postSignedWebhook({ dataId: link.externalPreferenceId, type: 'subscription_authorized_payment' });
      expect(res.status).toBe(200);

      const invoice = await prisma.clientInvoice.findUnique({ where: { externalPaymentId: link.externalPreferenceId } });
      expect(invoice).toBeNull();
    });
  });
});
