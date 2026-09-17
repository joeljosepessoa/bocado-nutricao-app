import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AppointmentReminderService } from '../src/appointments/appointment-reminder.service';
import { createClient, login, registerProfessional, uniqueEmail } from './helpers';

const prisma = new PrismaClient();

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe('Agenda e consultas (e2e — Fase 18)', () => {
  let app: INestApplication;
  let reminderService: AppointmentReminderService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    reminderService = moduleRef.get(AppointmentReminderService);
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

  async function createSlot(accessToken: string, startHours: number, endHours = startHours + 1) {
    const res = await request(app.getHttpServer())
      .post('/professionals/me/availability')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startAt: hoursFromNow(startHours), endAt: hoursFromNow(endHours) })
      .expect(201);
    return res.body;
  }

  // 1. profissional cria disponibilidade
  it('profissional cria disponibilidade', async () => {
    const { professional } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    expect(slot.professionalId).toBe(professional.user.id);
    expect(slot.isBooked).toBe(false);
  });

  // 5. conflito de horário é rejeitado
  it('disponibilidade que se sobrepõe a outra do mesmo profissional é rejeitada', async () => {
    const { professional } = await setup();
    await createSlot(professional.accessToken, 10, 11);
    await request(app.getHttpServer())
      .post('/professionals/me/availability')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ startAt: hoursFromNow(10.5), endAt: hoursFromNow(11.5) })
      .expect(409);
  });

  it('disponibilidade no passado é rejeitada; horário de término antes do início é rejeitado', async () => {
    const { professional } = await setup();
    await request(app.getHttpServer())
      .post('/professionals/me/availability')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ startAt: hoursFromNow(-2), endAt: hoursFromNow(-1) })
      .expect(400);
    await request(app.getHttpServer())
      .post('/professionals/me/availability')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ startAt: hoursFromNow(11), endAt: hoursFromNow(10) })
      .expect(400);
  });

  // 2. cliente visualiza disponibilidade
  it('cliente visualiza a disponibilidade do próprio profissional', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);

    const res = await request(app.getHttpServer())
      .get('/client/availability')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    expect(res.body.map((s: { id: string }) => s.id)).toContain(slot.id);
  });

  // 3 + 4. cliente agenda consulta; fica vinculada ao profissional correto
  it('cliente agenda consulta e ela fica vinculada ao profissional correto', async () => {
    const { professional, client, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);

    const res = await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ slotId: slot.id })
      .expect(201);

    expect(res.body).toMatchObject({
      clientId: client.id,
      professionalId: professional.user.id,
      slotId: slot.id,
      status: 'scheduled',
    });

    const bookedSlot = await prisma.availabilitySlot.findUnique({ where: { id: slot.id } });
    expect(bookedSlot?.isBooked).toBe(true);
  });

  // 12. cliente não consegue escolher outro profissional (só via slot de outro profissional)
  it('cliente não consegue agendar um horário de um profissional que não é o seu', async () => {
    const own = await setup();
    const other = await setup();
    const otherSlot = await createSlot(other.professional.accessToken, 10);

    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${own.clientAccessToken}`)
      .send({ slotId: otherSlot.id })
      .expect(404);
  });

  // 6. dois clientes não conseguem ocupar o mesmo horário
  it('dois clientes não conseguem agendar o mesmo horário', async () => {
    const { professional, clientAccessToken: clientA } = await setup();
    const { client: clientB, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientBLogin = await login(app, clientB.user.email, temporaryPassword);
    const clientBToken = clientBLogin.accessToken as string;

    const slot = await createSlot(professional.accessToken, 10);

    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientA}`)
      .send({ slotId: slot.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientBToken}`)
      .send({ slotId: slot.id })
      .expect(409);
  });

  // 7. confirmação funciona
  it('profissional confirma a consulta', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    const appointment = (
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201)
    ).body;

    const res = await request(app.getHttpServer())
      .post(`/professionals/me/appointments/${appointment.id}/confirm`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.status).toBe('confirmed');
  });

  // 8 + 9. cancelamento funciona; horário liberado pode ser reutilizado
  it('cancelamento libera o slot, que volta a ficar disponível', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    const appointment = (
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201)
    ).body;

    await request(app.getHttpServer())
      .post('/client/appointments/' + appointment.id + '/cancel')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    const cancelled = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelledAt).not.toBeNull();

    const freedSlot = await prisma.availabilitySlot.findUnique({ where: { id: slot.id } });
    expect(freedSlot?.isBooked).toBe(false);

    // o mesmo horário pode ser agendado de novo, por outro cliente
    const { client: clientB, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientBToken = (await login(app, clientB.user.email, temporaryPassword)).accessToken as string;
    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientBToken}`)
      .send({ slotId: slot.id })
      .expect(201);
  });

  it('profissional também pode cancelar', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    const appointment = (
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201)
    ).body;

    await request(app.getHttpServer())
      .post(`/professionals/me/appointments/${appointment.id}/cancel`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const cancelled = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(cancelled?.status).toBe('cancelled');
  });

  it('não é possível remover uma disponibilidade já reservada', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ slotId: slot.id })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/professionals/me/availability/${slot.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);
  });

  it('remover disponibilidade não reservada funciona', async () => {
    const { professional } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    await request(app.getHttpServer())
      .delete(`/professionals/me/availability/${slot.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(204);
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slot.id } })).toBeNull();
  });

  // 10. histórico retorna consultas corretas
  it('histórico do cliente retorna exatamente as próprias consultas', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot1 = await createSlot(professional.accessToken, 10);
    const slot2 = await createSlot(professional.accessToken, 20);
    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ slotId: slot1.id })
      .expect(201);
    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ slotId: slot2.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((a: { slotId: string }) => a.slotId).sort()).toEqual([slot1.id, slot2.id].sort());
  });

  it('profissional lista as próprias consultas', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    await request(app.getHttpServer())
      .post('/client/appointments')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({ slotId: slot.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/professionals/me/appointments')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.map((a: { slotId: string }) => a.slotId)).toContain(slot.id);
  });

  // --- Segurança / isolamento -------------------------------------------

  describe('Segurança e isolamento', () => {
    it('profissional A não acessa/confirma/cancela consulta do profissional B', async () => {
      const a = await setup();
      const b = await setup();
      const slot = await createSlot(a.professional.accessToken, 10);
      const appointment = (
        await request(app.getHttpServer())
          .post('/client/appointments')
          .set('Authorization', `Bearer ${a.clientAccessToken}`)
          .send({ slotId: slot.id })
          .expect(201)
      ).body;

      await request(app.getHttpServer())
        .post(`/professionals/me/appointments/${appointment.id}/confirm`)
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/professionals/me/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .expect(404);
    });

    it('cliente não acessa/cancela consulta de outro cliente', async () => {
      const { professional, clientAccessToken: clientA } = await setup();
      const { client: clientB, temporaryPassword } = await createClient(app, professional.accessToken);
      const clientBToken = (await login(app, clientB.user.email, temporaryPassword)).accessToken as string;

      const slot = await createSlot(professional.accessToken, 10);
      const appointment = (
        await request(app.getHttpServer())
          .post('/client/appointments')
          .set('Authorization', `Bearer ${clientA}`)
          .send({ slotId: slot.id })
          .expect(201)
      ).body;

      await request(app.getHttpServer())
        .post(`/client/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${clientBToken}`)
        .expect(404);
    });

    it('professional não vê nem remove disponibilidade de outro profissional (IDs manipulados)', async () => {
      const a = await setup();
      const b = await setup();
      const slot = await createSlot(a.professional.accessToken, 10);

      await request(app.getHttpServer())
        .delete(`/professionals/me/availability/${slot.id}`)
        .set('Authorization', `Bearer ${b.professional.accessToken}`)
        .expect(404);
    });

    it('cliente não autenticado como profissional não acessa rotas de disponibilidade/consultas do profissional', async () => {
      const { clientAccessToken } = await setup();
      await request(app.getHttpServer())
        .get('/professionals/me/availability')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/professionals/me/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(403);
    });

    it('ID de consulta inexistente resulta em 404', async () => {
      const { professional, clientAccessToken } = await setup();
      await request(app.getHttpServer())
        .post('/professionals/me/appointments/00000000-0000-0000-0000-000000000000/confirm')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post('/client/appointments/00000000-0000-0000-0000-000000000000/cancel')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(404);
    });
  });

  // 13. auditoria é criada
  it('auditoria registra criação de slot, agendamento, confirmação e cancelamento', async () => {
    const { professional, clientAccessToken } = await setup();
    const slot = await createSlot(professional.accessToken, 10);
    const appointment = (
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201)
    ).body;
    await request(app.getHttpServer())
      .post(`/professionals/me/appointments/${appointment.id}/confirm`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/professionals/me/appointments/${appointment.id}/cancel`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const logs = await prisma.appointmentAuditLog.findMany({
      where: { professionalId: professional.user.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['slot_created', 'appointment_created', 'appointment_confirmed', 'appointment_cancelled']),
    );
  });

  // --- Lembrete / notificações --------------------------------------------

  describe('Lembrete de consulta (NotificationDispatchService)', () => {
    it('lembrete é disparado para consulta dentro da janela, com token registrado', async () => {
      const { professional, client, clientAccessToken } = await setup();
      const pushToken = uniqueEmail('push-token-appointment');
      await request(app.getHttpServer())
        .post('/notifications/device-tokens')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ platform: 'ios', token: pushToken })
        .expect(201);

      const slot = await createSlot(professional.accessToken, 1); // 1h à frente — dentro da janela de 24h
      const appointment = (
        await request(app.getHttpServer())
          .post('/client/appointments')
          .set('Authorization', `Bearer ${clientAccessToken}`)
          .send({ slotId: slot.id })
          .expect(201)
      ).body;

      await reminderService.sendDueReminders();

      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated?.reminderSentAt).not.toBeNull();

      const log = await prisma.notificationLog.findFirst({
        where: { clientId: client.id, eventType: 'appointment_reminder' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.status).toBe('sent');
    });

    it('lembrete não é disparado de novo para a mesma consulta (idempotente)', async () => {
      const { professional, client, clientAccessToken } = await setup();
      const slot = await createSlot(professional.accessToken, 1);
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201);

      await reminderService.sendDueReminders();
      const afterFirst = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'appointment_reminder' } });

      await reminderService.sendDueReminders();
      const afterSecond = await prisma.notificationLog.count({ where: { clientId: client.id, eventType: 'appointment_reminder' } });

      expect(afterSecond).toBe(afterFirst);
    });

    it('consulta cancelada não recebe lembrete', async () => {
      const { professional, client, clientAccessToken } = await setup();
      const slot = await createSlot(professional.accessToken, 1);
      const appointment = (
        await request(app.getHttpServer())
          .post('/client/appointments')
          .set('Authorization', `Bearer ${clientAccessToken}`)
          .send({ slotId: slot.id })
          .expect(201)
      ).body;
      await request(app.getHttpServer())
        .post(`/client/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(200);

      await reminderService.sendDueReminders();

      const log = await prisma.notificationLog.findFirst({ where: { clientId: client.id, eventType: 'appointment_reminder' } });
      expect(log).toBeNull();
    });

    // 15. preferência de notificação desabilitada impede o envio
    it('preferência appointment_reminder desabilitada bloqueia o envio (skipped_preference)', async () => {
      const { professional, client, clientAccessToken } = await setup();
      await request(app.getHttpServer())
        .post('/notifications/device-tokens')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ platform: 'ios', token: uniqueEmail('push-token-pref-off') })
        .expect(201);
      await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ eventType: 'appointment_reminder', enabled: false })
        .expect(200);

      const slot = await createSlot(professional.accessToken, 1);
      await request(app.getHttpServer())
        .post('/client/appointments')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ slotId: slot.id })
        .expect(201);

      await reminderService.sendDueReminders();

      const log = await prisma.notificationLog.findFirst({
        where: { clientId: client.id, eventType: 'appointment_reminder' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.status).toBe('skipped_preference');
    });
  });
});
