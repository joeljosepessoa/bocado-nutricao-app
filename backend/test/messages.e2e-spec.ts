import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

describe('Mensagens (e2e — Fase 17)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientLogin = await login(app, client.user.email, temporaryPassword);
    return { professional, client, clientAccessToken: clientLogin.accessToken as string };
  }

  it('profissional envia mensagem e cliente vê na própria lista', async () => {
    const { professional, client, clientAccessToken } = await setup();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'Olá! Como você está?' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ senderRole: 'professional', body: 'Olá! Como você está?' });
  });

  it('cliente envia mensagem e profissional vê na própria lista', async () => {
    const { professional, client, clientAccessToken } = await setup();

    await request(app.getHttpServer())
      .post('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ body: 'Oi, tudo bem sim!' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ senderRole: 'client', body: 'Oi, tudo bem sim!' });
  });

  it('existe só uma thread por par profissional↔cliente (idempotente)', async () => {
    const { professional, client, clientAccessToken } = await setup();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'Mensagem 1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ body: 'Mensagem 2' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'Mensagem 3' })
      .expect(201);

    const threadCount = await prisma.messageThread.count({ where: { clientId: client.id, professionalId: professional.user.id } });
    expect(threadCount).toBe(1);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(res.body.map((m: { body: string }) => m.body)).toEqual(['Mensagem 1', 'Mensagem 2', 'Mensagem 3']);
  });

  it('mensagem do profissional é marcada como lida quando o cliente abre a thread; a do próprio cliente nunca é auto-marcada', async () => {
    const { professional, client, clientAccessToken } = await setup();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'Mensagem do profissional' })
      .expect(201);

    const beforeRead = await prisma.message.findFirst({ where: { thread: { clientId: client.id } } });
    expect(beforeRead?.readAt).toBeNull();

    await request(app.getHttpServer())
      .post('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ body: 'Mensagem do cliente' })
      .expect(201);

    // cliente abre a thread de novo — marca a do profissional como lida, nunca a própria
    const clientView = await request(app.getHttpServer())
      .get('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    const fromProfessional = clientView.body.find((m: { senderRole: string }) => m.senderRole === 'professional');
    const fromClient = clientView.body.find((m: { senderRole: string }) => m.senderRole === 'client');
    expect(fromProfessional.readAt).not.toBeNull();
    expect(fromClient.readAt).toBeNull();
  });

  it('profissional só vê a thread do próprio cliente — isolamento entre profissionais', async () => {
    const a = await setup();
    const b = await setup();

    await request(app.getHttpServer())
      .post(`/clients/${a.client.id}/messages`)
      .set('Authorization', `Bearer ${a.professional.accessToken}`)
      .send({ body: 'Só para o cliente de A' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/clients/${a.client.id}/messages`)
      .set('Authorization', `Bearer ${b.professional.accessToken}`)
      .expect(404);
  });

  it('validação: corpo vazio é rejeitado', async () => {
    const { professional, client } = await setup();
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: '' })
      .expect(400);
  });

  it('validação: corpo maior que 2000 caracteres é rejeitado', async () => {
    const { professional, client } = await setup();
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'a'.repeat(2001) })
      .expect(400);
  });

  it('cliente não autenticado como profissional não acessa a rota do profissional', async () => {
    const { client, clientAccessToken } = await setup();
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(403);
  });

  it('enviar mensagem dispara notificação para quem não enviou', async () => {
    const { professional, client } = await setup();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: 'Notifica o cliente' })
      .expect(201);

    const clientLog = await prisma.notificationLog.findFirst({
      where: { clientId: client.id, eventType: 'message_received' },
    });
    expect(clientLog).not.toBeNull();
  });

  it('auditoria registra thread_created, message_sent e thread_read, nunca o texto da mensagem', async () => {
    const { professional, client, clientAccessToken } = await setup();
    const secretBody = 'texto confidencial do paciente';

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/messages`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ body: secretBody })
      .expect(201);

    await request(app.getHttpServer())
      .get('/client/messages')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    const logs = await prisma.messageAuditLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['thread_created', 'message_sent', 'thread_read']));
    expect(JSON.stringify(logs)).not.toContain(secretBody);
  });
});
