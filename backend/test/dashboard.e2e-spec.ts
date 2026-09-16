import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createDiet, createWorkout, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

async function createEvaluation(app: INestApplication, accessToken: string, clientId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/evaluations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ heightCm: 178, weightKg: 80, ...overrides })
    .expect(201);
  return res.body;
}

describe('Dashboard do profissional (e2e)', () => {
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

  it('conta clientes (total/ativo/arquivado), avaliações pendentes de liberação e diets/workouts ativos — só do próprio profissional', async () => {
    const professional = await registerProfessional(app);
    const other = await registerProfessional(app);

    const { client: clientA } = await createClient(app, professional.accessToken);
    const { client: clientB } = await createClient(app, professional.accessToken);
    await createClient(app, other.accessToken); // não deve contar no dashboard de `professional`

    await request(app.getHttpServer())
      .patch(`/clients/${clientB.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'archived' })
      .expect(200);

    const evalA = await createEvaluation(app, professional.accessToken, clientA.id);
    await createEvaluation(app, professional.accessToken, clientA.id); // segunda, também não liberada

    await createDiet(app, professional.accessToken, clientA.id);
    await createWorkout(app, professional.accessToken, clientA.id);

    const res = await request(app.getHttpServer())
      .get('/professionals/me/dashboard')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.clients.total).toBe(2);
    expect(res.body.clients.active).toBe(1);
    expect(res.body.clients.archived).toBe(1);
    expect(res.body.evaluations.pendingRelease).toBe(2);
    expect(res.body.evaluations.last30Days).toBeGreaterThanOrEqual(2);
    expect(res.body.diets.active).toBe(1);
    expect(res.body.workouts.active).toBe(1);

    // liberar uma reduz o "pendente" em 1
    await request(app.getHttpServer())
      .patch(`/clients/${clientA.id}/evaluations/${evalA.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/professionals/me/dashboard')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(after.body.evaluations.pendingRelease).toBe(1);
  });

  it('atividade recente mescla avaliações/dietas/treinos, mais recente primeiro', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await createEvaluation(app, professional.accessToken, client.id);
    const diet = await createDiet(app, professional.accessToken, client.id);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${diet.currentVersion.id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/professionals/me/dashboard')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.recentActivity.length).toBeGreaterThanOrEqual(2);
    const types = res.body.recentActivity.map((a: { type: string }) => a.type);
    expect(types).toEqual(expect.arrayContaining(['evaluation_created', 'diet_published']));
    const dates = res.body.recentActivity.map((a: { occurredAt: string }) => new Date(a.occurredAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('cliente autenticado recebe 403 no dashboard', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);

    await request(app.getHttpServer())
      .get('/professionals/me/dashboard')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });
});
