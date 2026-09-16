import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ConsoleNotificationService } from '../src/notifications/console-notification.service';
import { createClient, createDiet, createWorkout, registerProfessional, uniqueEmail } from './helpers';

const prisma = new PrismaClient();

async function createEvaluation(app: INestApplication, accessToken: string, clientId: string) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/evaluations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ heightCm: 178, weightKg: 80 })
    .expect(201);
  return res.body;
}

function releaseEvaluation(app: INestApplication, accessToken: string, clientId: string, evaluationId: string, released = true) {
  return request(app.getHttpServer())
    .patch(`/clients/${clientId}/evaluations/${evaluationId}/release`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ released });
}

async function generateReport(app: INestApplication, accessToken: string, clientId: string, evaluationId: string, audience: 'professional' | 'client') {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/evaluations/${evaluationId}/reports`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ audience })
    .expect(201);
  return res.body;
}

function releaseReport(app: INestApplication, accessToken: string, clientId: string, reportId: string, released = true) {
  return request(app.getHttpServer())
    .patch(`/clients/${clientId}/reports/${reportId}/release`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ released });
}

async function loginAsClient(app: INestApplication, email: string, temporaryPassword: string) {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: temporaryPassword }).expect(200);
  return res.body.accessToken as string;
}

function registerToken(app: INestApplication, accessToken: string, token: string, platform: 'ios' | 'android' = 'ios') {
  return request(app.getHttpServer())
    .post('/notifications/device-tokens')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ platform, token });
}

describe('Notificações (e2e — Fase 16)', () => {
  let app: INestApplication;
  let consoleNotification: ConsoleNotificationService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    consoleNotification = moduleRef.get(ConsoleNotificationService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // --- DeviceToken ---------------------------------------------------------

  describe('Registro e revogação de device token', () => {
    it('profissional e cliente conseguem registrar um token', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientToken = await loginAsClient(app, client.user.email, temporaryPassword);

      await registerToken(app, professional.accessToken, uniqueEmail('prof-token')).expect(201);
      await registerToken(app, clientToken, uniqueEmail('client-token')).expect(201);
    });

    it('registrar o mesmo token duas vezes não duplica a linha (idempotente)', async () => {
      const professional = await registerProfessional(app);
      const token = uniqueEmail('dup-token');

      await registerToken(app, professional.accessToken, token).expect(201);
      await registerToken(app, professional.accessToken, token).expect(201);

      const count = await prisma.deviceToken.count({ where: { token } });
      expect(count).toBe(1);
    });

    it('revogar o próprio token funciona; revogar token de outra conta é bloqueado', async () => {
      const professionalA = await registerProfessional(app);
      const professionalB = await registerProfessional(app);
      const token = uniqueEmail('revoke-token');
      await registerToken(app, professionalA.accessToken, token).expect(201);

      await request(app.getHttpServer())
        .post('/notifications/device-tokens/revoke')
        .set('Authorization', `Bearer ${professionalB.accessToken}`)
        .send({ token })
        .expect(403);

      await request(app.getHttpServer())
        .post('/notifications/device-tokens/revoke')
        .set('Authorization', `Bearer ${professionalA.accessToken}`)
        .send({ token })
        .expect(204);

      const row = await prisma.deviceToken.findUnique({ where: { token } });
      expect(row?.revokedAt).not.toBeNull();
    });

    it('revogar um token que não existe não quebra (no-op silencioso)', async () => {
      const professional = await registerProfessional(app);
      await request(app.getHttpServer())
        .post('/notifications/device-tokens/revoke')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ token: 'token-que-nunca-existiu' })
        .expect(204);
    });
  });

  // --- Preferências ---------------------------------------------------------

  describe('Preferências de notificação', () => {
    it('sem nenhuma preferência salva, todos os 4 tipos vêm habilitados por padrão', async () => {
      const professional = await registerProfessional(app);
      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(4);
      expect(res.body.every((p: { enabled: boolean }) => p.enabled)).toBe(true);
      const types = res.body.map((p: { eventType: string }) => p.eventType).sort();
      expect(types).toEqual(['diet_published', 'evaluation_released', 'report_ready', 'workout_published'].sort());
    });

    it('desabilitar um tipo persiste e reflete na listagem', async () => {
      const professional = await registerProfessional(app);
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ eventType: 'diet_published', enabled: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);
      const dietPref = res.body.find((p: { eventType: string }) => p.eventType === 'diet_published');
      expect(dietPref.enabled).toBe(false);
    });

    it('preferência de um profissional não afeta a de outro (isolamento)', async () => {
      const professionalA = await registerProfessional(app);
      const professionalB = await registerProfessional(app);
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${professionalA.accessToken}`)
        .send({ eventType: 'workout_published', enabled: false })
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${professionalB.accessToken}`)
        .expect(200);
      const workoutPref = resB.body.find((p: { eventType: string }) => p.eventType === 'workout_published');
      expect(workoutPref.enabled).toBe(true);
    });
  });

  // --- Disparo integrado ---------------------------------------------------

  describe('Disparo de notificação pelos eventos reais', () => {
    it('avaliação liberada sem nenhum token de dispositivo do cliente: log fica "failed", mas a liberação não quebra', async () => {
      const professional = await registerProfessional(app);
      const { client } = await createClient(app, professional.accessToken);
      // token de outra conta (o profissional) — nunca deve ser usado para o cliente
      await registerToken(app, professional.accessToken, uniqueEmail('eval-released-other-account-token'));

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      const before = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'evaluation_released' } });

      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id).expect(200);

      const logs = await prisma.notificationLog.findMany({ where: { clientId: client.id, eventType: 'evaluation_released' } });
      expect(logs.length).toBe(before + 1);
      expect(logs[logs.length - 1].status).toBe('failed');
      expect(logs[logs.length - 1].errorMessage).toContain('Nenhum dispositivo');
    });

    it('avaliação liberada com token de cliente registrado envia via NotificationService (status sent)', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      const pushToken = uniqueEmail('push-token-eval');
      await registerToken(app, clientAccessToken, pushToken).expect(201);

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id).expect(200);

      const log = await prisma.notificationLog.findFirst({
        where: { clientId: client.id, eventType: 'evaluation_released' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.status).toBe('sent');
      expect(consoleNotification.getSentMessages().some((m) => m.to === pushToken)).toBe(true);
    });

    it('desliberar avaliação (released:false) não dispara notificação', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      await registerToken(app, clientAccessToken, uniqueEmail('push-token-unrelease')).expect(201);

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id, true).expect(200);
      const afterRelease = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'evaluation_released' } });

      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id, false).expect(200);
      const afterUnrelease = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'evaluation_released' } });

      expect(afterUnrelease).toBe(afterRelease);
    });

    it('preferência desabilitada bloqueia o envio (skipped_preference), sem quebrar a ação principal', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      await registerToken(app, clientAccessToken, uniqueEmail('push-token-pref-off')).expect(201);
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ eventType: 'evaluation_released', enabled: false })
        .expect(200);

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id).expect(200);

      const log = await prisma.notificationLog.findFirst({
        where: { clientId: client.id, eventType: 'evaluation_released' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.status).toBe('skipped_preference');
    });

    it('relatório: gerar não dispara "relatório pronto", só a liberação dispara (e só para audience client)', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      await registerToken(app, clientAccessToken, uniqueEmail('push-token-report')).expect(201);

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      // relatório de audience "client" exige a avaliação já liberada (regra pré-existente, não desta fase)
      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id).expect(200);

      await generateReport(app, professional.accessToken, client.id, evaluation.id, 'professional');
      const afterProfessionalGen = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'report_ready' } });
      expect(afterProfessionalGen).toBe(0);

      const clientReport = await generateReport(app, professional.accessToken, client.id, evaluation.id, 'client');
      const afterClientGen = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'report_ready' } });
      expect(afterClientGen).toBe(0); // gerar ainda não é liberar

      await releaseReport(app, professional.accessToken, client.id, clientReport.id).expect(200);
      const afterRelease = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'report_ready' } });
      expect(afterRelease).toBe(1);
    });

    it('dieta publicada dispara notificação', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      await registerToken(app, clientAccessToken, uniqueEmail('push-token-diet')).expect(201);

      const diet = await createDiet(app, professional.accessToken, client.id);
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/diets/${diet.id}/versions/${diet.currentVersion.id}/publish`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);

      const log = await prisma.notificationLog.findFirst({ where: { clientId: client.id, eventType: 'diet_published' } });
      expect(log?.status).toBe('sent');
    });

    it('treino publicado dispara notificação', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      await registerToken(app, clientAccessToken, uniqueEmail('push-token-workout')).expect(201);

      const workout = await createWorkout(app, professional.accessToken, client.id);
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/workouts/${workout.id}/versions/${workout.currentVersion.id}/publish`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(200);

      const log = await prisma.notificationLog.findFirst({ where: { clientId: client.id, eventType: 'workout_published' } });
      expect(log?.status).toBe('sent');
    });
  });

  // --- Auditoria de dados -----------------------------------------------

  describe('NotificationLog nunca guarda dado sensível', () => {
    it('log não contém token de push nem corpo da mensagem, só metadados', async () => {
      const professional = await registerProfessional(app);
      const { client, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientAccessToken = await loginAsClient(app, client.user.email, temporaryPassword);
      const pushToken = uniqueEmail('push-token-audit');
      await registerToken(app, clientAccessToken, pushToken).expect(201);

      const evaluation = await createEvaluation(app, professional.accessToken, client.id);
      await releaseEvaluation(app, professional.accessToken, client.id, evaluation.id).expect(200);

      const log = await prisma.notificationLog.findFirst({
        where: { clientId: client.id, eventType: 'evaluation_released' },
        orderBy: { createdAt: 'desc' },
      });
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain(pushToken);
    });
  });
});
