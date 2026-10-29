import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { todayIn } from '../src/professionals/alerts';
import { createClient, createDiet, registerProfessional } from './helpers';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe('Avisos para você (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const alerts = (token: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/professionals/me/alerts').query(query).set('Authorization', `Bearer ${token}`).expect(200);

  it('aponta quem está sem registrar, quem nunca registrou, aniversários, mensagens sem ler e dieta antiga', async () => {
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const today = todayIn('America/Sao_Paulo', new Date());
    const birthToday = `${today.year - 30}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;

    const never = (await createClient(app, me.accessToken, { fullName: 'Nunca Registrou' })).client;
    const quiet = (await createClient(app, me.accessToken, { fullName: 'Parou Faz Dias' })).client;
    const busy = (await createClient(app, me.accessToken, { fullName: 'Ativa Hoje', birthDate: birthToday })).client;
    const archived = (await createClient(app, me.accessToken, { fullName: 'Arquivada Antiga' })).client;

    await prisma.client.updateMany({ where: { id: { in: [never.id, quiet.id, busy.id, archived.id] } }, data: { createdAt: ago(40) } });
    await prisma.client.update({ where: { id: archived.id }, data: { status: 'archived', archivedAt: new Date() } });
    await prisma.clientWeightLog.create({ data: { clientId: quiet.id, weightKg: 70, recordedAt: ago(10), createdAt: ago(10) } });
    await prisma.clientWaterLog.create({ data: { clientId: busy.id, amountMl: 300, loggedOn: new Date(), loggedAt: new Date() } });
    const thread = await prisma.messageThread.create({ data: { clientId: busy.id, professionalId: quiet.professionalId } });
    await prisma.message.create({ data: { threadId: thread.id, senderRole: 'client', body: 'Posso trocar o arroz?', createdAt: ago(0.2) } });
    await prisma.message.create({ data: { threadId: thread.id, senderRole: 'client', body: 'Já li', readAt: new Date(), createdAt: ago(1) } });
    const diet = await createDiet(app, me.accessToken, busy.id);
    await prisma.dietVersion.update({ where: { id: diet.currentVersion.id }, data: { status: 'published', publishedAt: ago(60) } });

    const body = (await alerts(me.accessToken)).body;
    expect(body.settings).toEqual({ inactiveDays: 7, planDays: 45 });
    expect(body.inactive).toEqual([expect.objectContaining({ clientId: quiet.id, name: 'Parou Faz Dias', lastRecordKind: 'weight', days: 10, lastSeenAt: null })]);
    expect(body.neverRecorded.map((c: { clientId: string }) => c.clientId)).toEqual([never.id]);
    expect(body.neverRecorded[0]).toMatchObject({ days: 40, everOpenedApp: false });
    expect(body.birthdays).toEqual([expect.objectContaining({ clientId: busy.id, inDays: 0, age: 30 })]);
    expect(body.unreadMessages).toEqual([expect.objectContaining({ clientId: busy.id, name: 'Ativa Hoje', count: 1 })]);
    expect(body.stalePlans).toEqual([expect.objectContaining({ clientId: busy.id, kind: 'diet', days: 60 })]);

    // Limites mais folgados: 14 dias sem registrar e plano com 90 dias.
    const relaxed = (await alerts(me.accessToken, { inactiveDays: '14', planDays: '90' })).body;
    expect(relaxed.settings).toEqual({ inactiveDays: 14, planDays: 90 });
    expect(relaxed.inactive).toEqual([]);
    expect(relaxed.stalePlans).toEqual([]);

    // Outro profissional não vê nada disso.
    const theirs = (await alerts(other.accessToken)).body;
    expect([...theirs.inactive, ...theirs.neverRecorded, ...theirs.birthdays, ...theirs.unreadMessages, ...theirs.stalePlans]).toEqual([]);
  });
});
