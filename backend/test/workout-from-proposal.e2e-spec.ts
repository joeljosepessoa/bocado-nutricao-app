import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationDispatchService } from '../src/notifications/notification-dispatch.service';
import { createClient, createExercise, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Proposta revisada → treino NOVO em rascunho, numa transação, nunca publicado.
describe('Treino a partir de proposta revisada (e2e)', () => {
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const supino = await createExercise(app, professional.accessToken, { name: `Supino ${Date.now()}` });
    const triceps = await createExercise(app, professional.accessToken, { name: `Tríceps ${Date.now()}` });
    return { professional, client, temporaryPassword, supino, triceps, auth: { Authorization: `Bearer ${professional.accessToken}` } };
  }

  const proposal = (supinoId: string, tricepsId: string) => ({
    objective: 'Hipertrofia',
    days: [
      {
        name: 'SEGUNDA - PEITO + TRÍCEPS',
        notes: null,
        exercises: [
          {
            exerciseId: supinoId,
            notes: 'drop-set na última',
            sets: [
              { repsMin: 6, repsMax: 10, restSeconds: 90 },
              { repsMin: 6, repsMax: 10, restSeconds: 90 },
            ],
          },
          { exerciseId: tricepsId, notes: null, sets: [{ reps: 12, restSeconds: 60, loadValue: 25, loadUnit: 'kg' }] },
        ],
      },
      { name: 'QUARTA', exercises: [] },
    ],
  });

  const workoutsOf = (clientId: string) => prisma.workout.count({ where: { clientId } });

  it('cria treino em rascunho com dias, exercícios e séries na ordem revisada, faixa preservada', async () => {
    const { client, supino, triceps, auth } = await setup();

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send(proposal(supino.id, triceps.id))
      .expect(201);

    const version = res.body.currentVersion;
    expect(version).toMatchObject({ versionNumber: 1, status: 'draft', publishedAt: null, objective: 'Hipertrofia' });
    expect(version.days.map((d: { name: string; order: number }) => [d.order, d.name])).toEqual([
      [0, 'SEGUNDA - PEITO + TRÍCEPS'],
      [1, 'QUARTA'],
    ]);
    const [supinoEx, tricepsEx] = version.days[0].exercises;
    expect(supinoEx).toMatchObject({ order: 0, notes: 'drop-set na última', exercise: { id: supino.id } });
    expect(supinoEx.sets).toEqual([
      expect.objectContaining({ order: 0, reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 }),
      expect.objectContaining({ order: 1, reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 }),
    ]);
    expect(tricepsEx.sets).toEqual([
      expect.objectContaining({ order: 0, reps: 12, repsMin: null, repsMax: null, loadValue: 25, loadUnit: 'kg', restSeconds: 60 }),
    ]);
    expect(version.days[1].exercises).toEqual([]);
  });

  it('reabrir o rascunho mantém o exercício do catálogo e o GIF dele; publicado MANUALMENTE, o app do cliente recebe o mesmo GIF', async () => {
    const { client, temporaryPassword, supino, triceps, auth } = await setup();
    // O caminho do GIF só entra pelo importador de mídia (direto no banco), como em produção.
    await prisma.exercise.update({ where: { id: supino.id }, data: { imageUrl: '/exercise-media/' + 'b'.repeat(64) } });

    const created = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send(proposal(supino.id, triceps.id))
      .expect(201);

    const reopened = await request(app.getHttpServer()).get(`/clients/${client.id}/workouts/${created.body.id}`).set(auth).expect(200);
    const [supinoEx, tricepsEx] = reopened.body.currentVersion.days[0].exercises;
    expect(supinoEx.exercise).toMatchObject({ id: supino.id, imageUrl: '/exercise-media/' + 'b'.repeat(64) });
    expect(tricepsEx.exercise).toMatchObject({ id: triceps.id, imageUrl: null });

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${created.body.id}/versions/${created.body.currentVersion.id}/publish`)
      .set(auth)
      .expect(200);
    const session = await login(app, client.user.email, temporaryPassword);
    const clientView = await request(app.getHttpServer()).get('/client/workout').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    expect(clientView.body.workout.days[0].exercises[0]).toMatchObject({ exerciseName: supino.name, imageUrl: '/exercise-media/' + 'b'.repeat(64) });
    expect(clientView.body.workout.days[0].exercises[1].imageUrl).toBeNull();
  });

  it('não publica nem notifica o cliente — o cliente não vê o treino', async () => {
    const { client, temporaryPassword, supino, triceps, auth } = await setup();
    const dispatch = jest.spyOn(app.get(NotificationDispatchService), 'dispatch');

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send(proposal(supino.id, triceps.id))
      .expect(201);

    expect(dispatch).not.toHaveBeenCalled();
    expect(await prisma.workoutVersion.count({ where: { workoutId: res.body.id, status: 'published' } })).toBe(0);
    const actions = (await prisma.workoutAuditLog.findMany({ where: { workoutId: res.body.id } })).map((a) => a.action);
    expect(actions).toEqual(['created']);

    const session = await login(app, client.user.email, temporaryPassword);
    const clientView = await request(app.getHttpServer()).get('/client/workout').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    expect(clientView.body).toEqual({ workout: null });
  });

  it('falha no meio da transação não deixa treino parcial', async () => {
    const { client, supino, triceps, auth } = await setup();
    const prismaService = app.get(PrismaService);
    const realTransaction = prismaService.$transaction.bind(prismaService);
    // Só chega em workoutSet.createMany depois que treino, versão, dia e
    // exercício já foram inseridos DENTRO da transação — é isso que prova o rollback.
    let insertedBeforeFailure = 0;
    jest.spyOn(prismaService, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
      realTransaction(
        (tx: Record<string, unknown>) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop === 'workoutSet') {
                  return {
                    createMany: () => {
                      throw new Error('falha simulada ao gravar séries');
                    },
                  };
                }
                if (prop === 'workout' || prop === 'workoutVersion' || prop === 'workoutDay' || prop === 'workoutExercise') {
                  const delegate = target[prop] as { create: (args: unknown) => Promise<unknown> };
                  return {
                    create: async (args: unknown) => {
                      const row = await delegate.create(args);
                      insertedBeforeFailure += 1;
                      return row;
                    },
                  };
                }
                return target[prop as string];
              },
            }),
          ),
        options as never,
      )) as never);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send(proposal(supino.id, triceps.id))
      .expect(500);

    // workout + versão + dia + exercício gravados antes da falha...
    expect(insertedBeforeFailure).toBe(4);
    // ...e nenhum deles sobreviveu.
    expect(await workoutsOf(client.id)).toBe(0);
    expect(await prisma.workoutDay.count({ where: { name: 'SEGUNDA - PEITO + TRÍCEPS', workoutVersion: { workout: { clientId: client.id } } } })).toBe(0);
  });

  it('profissional sem acesso ao cliente: 404 e nada criado', async () => {
    const { client, supino, triceps } = await setup();
    const intruder = await registerProfessional(app);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send(proposal(supino.id, triceps.id))
      .expect(404);
    expect(await workoutsOf(client.id)).toBe(0);
  });

  it('exercício que o profissional não enxerga (privado de outro): 404 e nada criado', async () => {
    const { client, supino, auth } = await setup();
    const other = await registerProfessional(app);
    const foreign = await createExercise(app, other.accessToken, { name: `Privado alheio ${Date.now()}`, scope: 'private' });

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send(proposal(supino.id, foreign.id))
      .expect(404);
    expect(await workoutsOf(client.id)).toBe(0);
  });

  it('prescrição de repetições inválida: 400 apontando dia/exercício/série, nada criado', async () => {
    const { client, supino, triceps, auth } = await setup();
    const bad = proposal(supino.id, triceps.id);
    bad.days[0].exercises[1].sets[0] = { reps: 12, repsMin: 8, repsMax: 10 } as never;

    const res = await request(app.getHttpServer()).post(`/clients/${client.id}/workouts/from-proposal`).set(auth).send(bad).expect(400);
    expect(res.body.message).toMatch(/Dia 1, exercício 2, série 1/);
    expect(await workoutsOf(client.id)).toBe(0);
  });

  it('estrutura inválida é rejeitada antes de gravar (400)', async () => {
    const { client, supino, triceps, auth } = await setup();
    const url = `/clients/${client.id}/workouts/from-proposal`;
    const send = (body: unknown) => request(app.getHttpServer()).post(url).set(auth).send(body as object);

    await send({ days: [] }).expect(400);
    await send({ days: [{ name: '  ', exercises: [] }] }).expect(400);
    await send({ days: [{ name: 'A', exercises: [{ notes: 'sem exerciseId', sets: [] }] }] }).expect(400);
    await send({ ...proposal(supino.id, triceps.id), publish: true }).expect(400);
    const tooManySets = proposal(supino.id, triceps.id);
    tooManySets.days[0].exercises[0].sets = Array.from({ length: 31 }, () => ({ reps: 10 })) as never;
    await send(tooManySets).expect(400);
    const outOfRange = proposal(supino.id, triceps.id);
    outOfRange.days[0].exercises[1].sets[0] = { reps: 12, restSeconds: 3_000_000_000 } as never;
    await send(outOfRange).expect(400);

    expect(await workoutsOf(client.id)).toBe(0);
  });

  it('cliente não acessa o endpoint (403)', async () => {
    const { client, temporaryPassword, supino, triceps } = await setup();
    const session = await login(app, client.user.email, temporaryPassword);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(proposal(supino.id, triceps.id))
      .expect(403);
    expect(await workoutsOf(client.id)).toBe(0);
  });
});
