import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingCycleService } from '../src/billing/billing-cycle.service';
import { PaymentGatewayService } from '../src/billing/gateway/payment-gateway.service';
import { registerProfessional } from './helpers';

const prisma = new PrismaClient();

describe('Comercial: planos e assinaturas (e2e — Fase 22)', () => {
  let app: INestApplication;
  let billingCycle: BillingCycleService;
  let gateway: PaymentGatewayService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    billingCycle = moduleRef.get(BillingCycleService);
    gateway = moduleRef.get(PaymentGatewayService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /professionals/me/billing/plans lista o catálogo (seed da Fase 22)', async () => {
    const professional = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .get('/professionals/me/billing/plans')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const codes = res.body.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['starter_monthly', 'pro_monthly', 'pro_yearly']));
  });

  it('sem assinatura, GET /subscription retorna null', async () => {
    const professional = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .get('/professionals/me/billing/subscription')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(res.body.subscription).toBeNull();
  });

  it('assina um plano com trial: status trialing, período do tamanho do trial, IDs do gateway mock preenchidos', async () => {
    const professional = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);

    expect(res.body.status).toBe('trialing');
    expect(res.body.plan.code).toBe('starter_monthly');
    expect(res.body.gatewayCustomerId).toMatch(/^mock_cus_/);
    expect(res.body.gatewaySubscriptionId).toMatch(/^mock_sub_/);
    expect(res.body.invoices).toEqual([]);

    const periodStart = new Date(res.body.currentPeriodStart).getTime();
    const periodEnd = new Date(res.body.currentPeriodEnd).getTime();
    expect(periodEnd - periodStart).toBeCloseTo(14 * 24 * 60 * 60 * 1000, -3);
  });

  it('assinar de novo com uma assinatura já ativa é rejeitado com 409', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'pro_monthly' })
      .expect(409);
  });

  it('plano inexistente é rejeitado com 400', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'plano-que-nao-existe' })
      .expect(400);
  });

  it('cancelar marca cancelAtPeriodEnd sem encerrar o acesso imediatamente', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/professionals/me/billing/cancel')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.cancelAtPeriodEnd).toBe(true);
    expect(res.body.status).toBe('trialing');
  });

  it('cancelar sem assinatura resulta em 404', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/cancel')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(404);
  });

  it('BillingCycleService: fim do trial cobra a primeira fatura e vira active', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);

    // Empurra o fim do período de trial para o passado — simula o trial
    // ter terminado, sem precisar esperar 14 dias de verdade.
    await prisma.subscription.update({
      where: { professionalId: professional.user.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });

    await billingCycle.processDueBilling();

    const res = await request(app.getHttpServer())
      .get('/professionals/me/billing/subscription')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.subscription.status).toBe('active');
    expect(res.body.subscription.invoices).toHaveLength(1);
    expect(res.body.subscription.invoices[0].status).toBe('paid');
    expect(res.body.subscription.invoices[0].amountCents).toBe(4990);
  });

  it('BillingCycleService: assinatura marcada para cancelar vira canceled no fim do período, sem gerar fatura', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/cancel')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await prisma.subscription.update({
      where: { professionalId: professional.user.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });

    await billingCycle.processDueBilling();

    const res = await request(app.getHttpServer())
      .get('/professionals/me/billing/subscription')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.subscription.status).toBe('canceled');
    expect(res.body.subscription.invoices).toHaveLength(0);
  });

  it('depois de cancelada, dá para assinar de novo (reaproveita a mesma linha, histórico de fatura preservado)', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'starter_monthly' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/professionals/me/billing/cancel')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    await prisma.subscription.update({
      where: { professionalId: professional.user.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    await billingCycle.processDueBilling();

    const res = await request(app.getHttpServer())
      .post('/professionals/me/billing/subscribe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ planCode: 'pro_monthly' })
      .expect(200);

    expect(res.body.status).toBe('trialing');
    expect(res.body.plan.code).toBe('pro_monthly');
    expect(res.body.cancelAtPeriodEnd).toBe(false);
  });

  it('webhook: assinatura HMAC válida é aceita; inválida é rejeitada com 400', async () => {
    const payload = JSON.stringify({ type: 'test.event', gatewaySubscriptionId: 'mock_sub_inexistente' });
    const validSignature = gateway.signWebhookPayload(payload);

    await request(app.getHttpServer())
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', validSignature)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'assinatura-forjada')
      .send(payload)
      .expect(400);

    await request(app.getHttpServer()).post('/billing/webhook').send(payload).expect(400);
  });
});
