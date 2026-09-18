import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClientInvoicesService } from '../src/client-billing/client-invoices.service';
import { PaymentLinksService } from '../src/client-billing/payment-links.service';
import { CreatePaymentLinkDto } from '../src/client-billing/dto/create-payment-link.dto';
import { registerProfessional, createClient, login } from './helpers';

const prisma = new PrismaClient();

async function setup(app: INestApplication) {
  const professional = await registerProfessional(app);
  const { client, temporaryPassword } = await createClient(app, professional.accessToken);
  return { professional, client, temporaryPassword };
}


async function createProduct(
  app: INestApplication,
  accessToken: string,
  overrides: Record<string, unknown> = {},
) {
  const payload = {
    name: 'Acompanhamento 3 meses',
    priceCents: 25_900,
    billingType: 'one_time',
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/professionals/me/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(payload)
    .expect(201);
  return res.body;
}

describe('Comercial cliente (e2e — Fase 23.3)', () => {
  let app: INestApplication;
  let clientInvoicesService: ClientInvoicesService;
  let paymentLinksService: PaymentLinksService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    clientInvoicesService = moduleRef.get(ClientInvoicesService);
    paymentLinksService = moduleRef.get(PaymentLinksService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------
  // 1. ProfessionalProduct — CRUD e ciclo funcional (cenários 1-8 do enunciado)
  // -------------------------------------------------------------------

  describe('ProfessionalProduct', () => {
    it('profissional cria produto one_time', async () => {
      const { professional } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      expect(product.billingType).toBe('one_time');
      expect(product.priceCents).toBe(25_900);
      expect(product.active).toBe(true);
    });

    it('profissional lista os próprios produtos', async () => {
      const { professional } = await setup(app);
      await createProduct(app, professional.accessToken, { name: 'Avaliação' });
      const res = await request(app.getHttpServer())
        .get('/professionals/me/products')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Avaliação');
    });

    it('profissional atualiza um produto', async () => {
      const { professional } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const res = await request(app.getHttpServer())
        .patch(`/professionals/me/products/${product.id}`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ priceCents: 29_900 })
        .expect(200);
      expect(res.body.priceCents).toBe(29_900);
    });

    it('profissional desativa um produto', async () => {
      const { professional } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const res = await request(app.getHttpServer())
        .post(`/professionals/me/products/${product.id}/deactivate`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(res.body.active).toBe(false);
    });

    it('produto desativado não pode gerar payment link', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      await request(app.getHttpServer())
        .post(`/professionals/me/products/${product.id}/deactivate`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(400);
    });

    it('profissional cria produto recurring válido (com recurrenceInterval)', async () => {
      const { professional } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        name: 'Acompanhamento mensal',
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      expect(product.billingType).toBe('recurring');
      expect(product.recurrenceInterval).toBe('month');
    });

    it('recurring sem recurrenceInterval é rejeitado', async () => {
      const { professional } = await setup(app);
      await request(app.getHttpServer())
        .post('/professionals/me/products')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ name: 'X', priceCents: 1000, billingType: 'recurring' })
        .expect(400);
    });

    it('one_time com recurrenceInterval é rejeitado', async () => {
      const { professional } = await setup(app);
      await request(app.getHttpServer())
        .post('/professionals/me/products')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ name: 'X', priceCents: 1000, billingType: 'one_time', recurrenceInterval: 'month' })
        .expect(400);
    });

    it('update: mudar para one_time com recurrenceInterval ainda no corpo é rejeitado', async () => {
      const { professional } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      await request(app.getHttpServer())
        .patch(`/professionals/me/products/${product.id}`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ billingType: 'one_time', recurrenceInterval: 'month' })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------
  // 2. PaymentLink — criação, congelamento de valor, cancelamento
  // -------------------------------------------------------------------

  describe('PaymentLink', () => {
    it('profissional cria payment link; gateway mock retorna externalId + checkoutUrl; link é persistido', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);

      const res = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      expect(res.body.status).toBe('created');
      expect(res.body.amountCents).toBe(25_900);
      expect(res.body.paymentType).toBe('one_time');
      expect(res.body.checkoutUrl).toMatch(/^https:\/\/mock-gateway\.invalid\/checkout\//);
      expect(res.body.externalPreferenceId).toMatch(/^mock_pref_/);
      expect(res.body.externalSubscriptionId).toBeNull();

      const stored = await prisma.paymentLink.findUnique({ where: { id: res.body.id } });
      expect(stored).not.toBeNull();
      expect(stored?.clientId).toBe(client.id);
      expect(stored?.professionalId).toBe(professional.user.id);
    });

    it('payment link recorrente usa createRecurringCheckout (externalSubscriptionId, não externalPreferenceId)', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });

      const res = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      expect(res.body.externalSubscriptionId).toMatch(/^mock_preapproval_/);
      expect(res.body.externalPreferenceId).toBeNull();
    });

    it('valor congelado no link permanece mesmo após alteração posterior do preço do produto', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, { priceCents: 10_000 });

      const link = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);
      expect(link.body.amountCents).toBe(10_000);

      await request(app.getHttpServer())
        .patch(`/professionals/me/products/${product.id}`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ priceCents: 99_999 })
        .expect(200);

      const stillFrozen = await prisma.paymentLink.findUnique({ where: { id: link.body.id } });
      expect(stillFrozen?.amountCents).toBe(10_000);
    });

    it('cliente consegue consultar seus próprios payment links', async () => {
      const { professional, client, temporaryPassword } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      const session = await login(app, client.user.email, temporaryPassword);
      const res = await request(app.getHttpServer())
        .get('/client/payment-links')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].professionalProductId).toBe(product.id);
    });

    it('profissional consulta seus payment links (lista todos, ou filtra por clientId)', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      const all = await request(app.getHttpServer())
        .get('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(all.body).toHaveLength(1);

      const filtered = await request(app.getHttpServer())
        .get(`/professionals/me/payment-links?clientId=${client.id}`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(filtered.body).toHaveLength(1);
    });

    it('cancelamento funciona (link created → canceled)', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/professionals/me/payment-links/${link.body.id}/cancel`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(res.body.status).toBe('canceled');
    });

    it('cancelar um link já cancelado (não mais "created") é rejeitado', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/professionals/me/payment-links/${link.body.id}/cancel`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/professionals/me/payment-links/${link.body.id}/cancel`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(409);
    });

    it('markExpired (uso interno, sem rota) marca links vencidos e audita', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      await prisma.paymentLink.update({
        where: { id: link.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const count = await paymentLinksService.markExpired();
      expect(count).toBeGreaterThanOrEqual(1);

      const updated = await prisma.paymentLink.findUnique({ where: { id: link.body.id } });
      expect(updated?.status).toBe('expired');

      const auditRows = await prisma.clientBillingAuditLog.findMany({
        where: { paymentLinkId: link.body.id, action: 'link_expired' },
      });
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
    });

    it('auditoria é criada ao gerar um link', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ clientId: client.id, professionalProductId: product.id })
        .expect(201);

      const auditRows = await prisma.clientBillingAuditLog.findMany({
        where: { paymentLinkId: link.body.id, action: 'link_created' },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].clientId).toBe(client.id);
      expect(auditRows[0].professionalId).toBe(professional.user.id);
    });
  });

  // -------------------------------------------------------------------
  // 3. Isolamento / segurança (cenário 8-10 do enunciado da Fase 23.1)
  // -------------------------------------------------------------------

  describe('Isolamento cross-tenant', () => {
    it('profissional A não acessa produto de profissional B (update → 404)', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken);

      await request(app.getHttpServer())
        .patch(`/professionals/me/products/${productB.id}`)
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ priceCents: 1 })
        .expect(404);
    });

    it('profissional A não desativa produto de profissional B', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken);

      await request(app.getHttpServer())
        .post(`/professionals/me/products/${productB.id}/deactivate`)
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .expect(404);
    });

    it('profissional A não cria payment link usando produto de profissional B', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken);

      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ clientId: a.client.id, professionalProductId: productB.id })
        .expect(404);
    });

    it('profissional A não cria payment link para cliente de profissional B', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productA = await createProduct(app, a.professional.accessToken);

      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ clientId: b.client.id, professionalProductId: productA.id })
        .expect(404);
    });

    it('profissional A não acessa/cancela payment link de cliente de profissional B', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken);
      const linkB = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .send({ clientId: b.client.id, professionalProductId: productB.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/professionals/me/payment-links/${linkB.body.id}/cancel`)
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .expect(404);
    });

    it('cliente A não acessa payment link de cliente B (isolado por clientId na consulta do próprio cliente)', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken);
      const linkB = await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .send({ clientId: b.client.id, professionalProductId: productB.id })
        .expect(201);

      const found = await paymentLinksService.getForClient(a.client.id, linkB.body.id).catch((e) => e);
      expect(found).toBeInstanceOf(Error);
    });

    it('profissional não acessa produto/cliente/link inexistente com IDs manipulados — 404, nunca 500', async () => {
      const a = await setup(app);
      await request(app.getHttpServer())
        .patch('/professionals/me/products/id-que-nao-existe')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ priceCents: 1 })
        .expect(404);

      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ clientId: 'id-que-nao-existe', professionalProductId: 'id-que-nao-existe' })
        .expect(404);
    });

    it('cliente A autenticado só vê os próprios payment links, nunca os de cliente B (mesmo profissional ou não)', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productA = await createProduct(app, a.professional.accessToken);
      const productB = await createProduct(app, b.professional.accessToken);
      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .send({ clientId: a.client.id, professionalProductId: productA.id })
        .expect(201);
      await request(app.getHttpServer())
        .post('/professionals/me/payment-links')
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .send({ clientId: b.client.id, professionalProductId: productB.id })
        .expect(201);

      // Nenhum DTO client-facing deste domínio aceita professionalId no
      // corpo — o isolamento vem inteiramente de user.id (JWT), nunca de
      // um parâmetro que o cliente poderia manipular.
      const sessionA = await login(app, a.client.user.email, a.temporaryPassword);
      const res = await request(app.getHttpServer())
        .get('/client/payment-links')
        .set('Authorization', `Bearer ${sessionA.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].professionalProductId).toBe(productA.id);
    });
  });

  // -------------------------------------------------------------------
  // 4. ClientSubscription — leitura/cancelamento (linhas semeadas direto,
  //    já que a criação real só existe a partir da Fase 23.6/webhook)
  // -------------------------------------------------------------------

  describe('ClientSubscription', () => {
    async function seedSubscription(professionalId: string, clientId: string, productId: string) {
      return prisma.clientSubscription.create({
        data: {
          professionalId,
          clientId,
          professionalProductId: productId,
          status: 'authorized',
          externalSubscriptionId: `mock_preapproval_${Math.random().toString(36).slice(2)}`,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    it('assinatura pode ser consultada pelo profissional', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      await seedSubscription(professional.user.id, client.id, product.id);

      const res = await request(app.getHttpServer())
        .get('/professionals/me/client-subscriptions')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('authorized');
    });

    it('cancelamento de assinatura define cancelAtPeriodEnd (não corta acesso na hora)', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      const sub = await seedSubscription(professional.user.id, client.id, product.id);

      const res = await request(app.getHttpServer())
        .post(`/professionals/me/client-subscriptions/${sub.id}/cancel`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      expect(res.body.cancelAtPeriodEnd).toBe(true);
      expect(res.body.status).toBe('authorized'); // continua ativa até o fim do período
    });

    it('profissional A não consulta/cancela assinatura de cliente de profissional B', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productB = await createProduct(app, b.professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      const subB = await seedSubscription(b.professional.user.id, b.client.id, productB.id);

      await request(app.getHttpServer())
        .post(`/professionals/me/client-subscriptions/${subB.id}/cancel`)
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .expect(404);
    });

    it('múltiplas ClientSubscription para o mesmo cliente são permitidas (histórico preservado)', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      await seedSubscription(professional.user.id, client.id, product.id);
      await seedSubscription(professional.user.id, client.id, product.id);

      const rows = await prisma.clientSubscription.findMany({ where: { professionalId: professional.user.id, clientId: client.id } });
      expect(rows).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------
  // 5. ClientInvoice — regra de origem exclusiva (cenários 21-24)
  // -------------------------------------------------------------------

  describe('ClientInvoice — regra de origem exclusiva', () => {
    it('rejeita quando paymentLinkId e clientSubscriptionId são preenchidos ao mesmo tempo', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await paymentLinksService.create(professional.user.id, <CreatePaymentLinkDto>{
        clientId: client.id,
        professionalProductId: product.id,
      });

      const subscription = await prisma.clientSubscription.create({
        data: {
          professionalId: professional.user.id,
          clientId: client.id,
          professionalProductId: product.id,
          status: 'authorized',
          externalSubscriptionId: `mock_preapproval_${Math.random().toString(36).slice(2)}`,
        },
      });

      await expect(
        clientInvoicesService.create({
          professionalId: professional.user.id,
          clientId: client.id,
          paymentLinkId: link.id,
          clientSubscriptionId: subscription.id,
          amountCents: 1000,
          externalPaymentId: `mock_pay_${Math.random()}`,
        }),
      ).rejects.toThrow();
    });

    it('rejeita quando nenhuma origem é informada', async () => {
      const { professional, client } = await setup(app);
      await expect(
        clientInvoicesService.create({
          professionalId: professional.user.id,
          clientId: client.id,
          amountCents: 1000,
          externalPaymentId: `mock_pay_${Math.random()}`,
        }),
      ).rejects.toThrow();
    });

    it('aceita somente com paymentLinkId', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken);
      const link = await paymentLinksService.create(professional.user.id, <CreatePaymentLinkDto>{
        clientId: client.id,
        professionalProductId: product.id,
      });

      const invoice = await clientInvoicesService.create({
        professionalId: professional.user.id,
        clientId: client.id,
        paymentLinkId: link.id,
        amountCents: link.amountCents,
        externalPaymentId: `mock_pay_${Math.random()}`,
      });
      expect(invoice.paymentLinkId).toBe(link.id);
      expect(invoice.clientSubscriptionId).toBeNull();
    });

    it('aceita somente com clientSubscriptionId', async () => {
      const { professional, client } = await setup(app);
      const product = await createProduct(app, professional.accessToken, {
        billingType: 'recurring',
        recurrenceInterval: 'month',
      });
      const subscription = await prisma.clientSubscription.create({
        data: {
          professionalId: professional.user.id,
          clientId: client.id,
          professionalProductId: product.id,
          status: 'authorized',
          externalSubscriptionId: `mock_preapproval_${Math.random().toString(36).slice(2)}`,
        },
      });

      const invoice = await clientInvoicesService.create({
        professionalId: professional.user.id,
        clientId: client.id,
        clientSubscriptionId: subscription.id,
        amountCents: 9990,
        externalPaymentId: `mock_pay_${Math.random()}`,
      });
      expect(invoice.clientSubscriptionId).toBe(subscription.id);
      expect(invoice.paymentLinkId).toBeNull();
    });

    it('faturas podem ser consultadas pelo profissional, isoladas por tenant', async () => {
      const a = await setup(app);
      const b = await setup(app);
      const productA = await createProduct(app, a.professional.accessToken);
      const linkA = await paymentLinksService.create(a.professional.user.id, <CreatePaymentLinkDto>{
        clientId: a.client.id,
        professionalProductId: productA.id,
      });
      await clientInvoicesService.create({
        professionalId: a.professional.user.id,
        clientId: a.client.id,
        paymentLinkId: linkA.id,
        amountCents: linkA.amountCents,
        externalPaymentId: `mock_pay_${Math.random()}`,
      });

      const resA = await request(app.getHttpServer())
        .get('/professionals/me/client-invoices')
        .set('Authorization', `Bearer ${a.professional.accessToken}`)
        .expect(200);
      expect(resA.body).toHaveLength(1);

      const resB = await request(app.getHttpServer())
        .get('/professionals/me/client-invoices')
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .expect(200);
      expect(resB.body).toHaveLength(0);
    });
  });
});
