import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Telas "Avaliação" e "Relatórios" do menu do painel: visão de todos os pacientes do profissional.
describe('Visões do menu: avaliações e relatórios (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

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

  async function evaluate(auth: Record<string, string>, clientId: string, evaluatedAt: string) {
    const res = await http().post(`/clients/${clientId}/evaluations`).set(auth).send({ heightCm: 170, weightKg: 70, evaluatedAt }).expect(201);
    return res.body as { id: string };
  }

  it('Avaliação: por paciente, quantas avaliações e a última — sem medidas e sem pacientes de outro profissional', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client: withTwo } = await createClient(app, professional.accessToken);
    const { client: withNone } = await createClient(app, professional.accessToken);
    await evaluate(auth, withTwo.id, '2026-08-01T12:00:00.000Z');
    const latest = await evaluate(auth, withTwo.id, '2026-10-01T12:00:00.000Z');

    const other = await registerProfessional(app);
    const { client: foreign } = await createClient(app, other.accessToken);
    await evaluate({ Authorization: `Bearer ${other.accessToken}` }, foreign.id, '2026-10-02T12:00:00.000Z');

    const res = await http().get('/evaluations/summary').set(auth).expect(200);
    expect(res.body).toEqual([{ clientId: withTwo.id, total: 2, lastEvaluationId: latest.id, lastEvaluatedAt: '2026-10-01T12:00:00.000Z' }]);
    expect(JSON.stringify(res.body)).not.toMatch(/weight|height|170|70\b/);
    expect(res.body.some((row: { clientId: string }) => row.clientId === withNone.id || row.clientId === foreign.id)).toBe(false);
  });

  it('Relatórios: todos os pacientes, do mais novo ao mais antigo, com nome do paciente e data da avaliação', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client: ana } = await createClient(app, professional.accessToken, { fullName: 'Paciente Um' });
    const { client: bia } = await createClient(app, professional.accessToken, { fullName: 'Paciente Dois' });
    const evA = await evaluate(auth, ana.id, '2026-09-10T12:00:00.000Z');
    const evB = await evaluate(auth, bia.id, '2026-10-10T12:00:00.000Z');
    const professionalId = (await prisma.client.findUniqueOrThrow({ where: { id: ana.id } })).professionalId;

    const base = { professionalId, templateVersion: 2, status: 'ready' as const, sizeBytes: 1000 };
    const older = await prisma.report.create({ data: { ...base, clientId: ana.id, evaluationId: evA.id, audience: 'professional', createdAt: new Date('2026-09-11T00:00:00Z') } });
    const newer = await prisma.report.create({ data: { ...base, clientId: bia.id, evaluationId: evB.id, audience: 'client', createdAt: new Date('2026-10-11T00:00:00Z') } });

    const other = await registerProfessional(app);
    const { client: foreign } = await createClient(app, other.accessToken);
    const evF = await evaluate({ Authorization: `Bearer ${other.accessToken}` }, foreign.id, '2026-10-12T12:00:00.000Z');
    const otherId = (await prisma.client.findUniqueOrThrow({ where: { id: foreign.id } })).professionalId;
    await prisma.report.create({ data: { ...base, professionalId: otherId, clientId: foreign.id, evaluationId: evF.id, audience: 'professional' } });

    const res = await http().get('/reports').set(auth).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((r: { id: string }) => r.id)).toEqual([newer.id, older.id]);
    expect(res.body.items[0]).toMatchObject({ clientId: bia.id, clientName: 'Paciente Dois', audience: 'client', status: 'ready', evaluatedAt: '2026-10-10T12:00:00.000Z' });
    // Nada técnico interno sai na lista.
    expect(res.body.items[0]).not.toHaveProperty('storageKey');
    expect(res.body.items[0]).not.toHaveProperty('dataSnapshot');
  });

  it('só profissional: paciente recebe 403 e sem login 401', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    const clientAuth = { Authorization: `Bearer ${session.accessToken}` };
    await http().get('/evaluations/summary').set(clientAuth).expect(403);
    await http().get('/reports').set(clientAuth).expect(403);
    await http().get('/evaluations/summary').expect(401);
    await http().get('/reports').expect(401);
  });
});
