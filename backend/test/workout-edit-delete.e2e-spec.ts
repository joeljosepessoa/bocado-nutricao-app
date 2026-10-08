import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { AppModule } from '../src/app.module';
import { createClient, createDiet, createExercise, createWorkout, registerProfessional } from './helpers';

// R2 ligado com credencial fictícia só para provar que excluir treino nunca chama DELETE no bucket.
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn(async () => 'https://conta-teste.r2.cloudflarestorage.com/b/k?X-Amz-Signature=x') }));

const prisma = new PrismaClient();
const R2_ENV = {
  EXERCISE_MEDIA_S3_BUCKET: 'bucket-e2e',
  EXERCISE_MEDIA_S3_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com',
  EXERCISE_MEDIA_S3_ACCESS_KEY_ID: 'id-e2e',
  EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: 'segredo-e2e',
};

describe('Treino — editar e excluir (e2e)', () => {
  let app: INestApplication;
  const s3Send = jest.spyOn(S3Client.prototype, 'send');

  beforeAll(async () => {
    Object.assign(process.env, R2_ENV);
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    for (const key of Object.keys(R2_ENV)) delete process.env[key];
  });

  const http = () => request(app.getHttpServer());

  /** Treino publicado (v1) com 1 dia, 2 exercícios (1 com GIF no R2) e 1 série cada. */
  async function setupPublished() {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const tag = Date.now();
    const supino = await createExercise(app, professional.accessToken, { name: `Supino ${tag}`, scope: 'private' });
    const remada = await createExercise(app, professional.accessToken, { name: `Remada ${tag}`, scope: 'private' });
    const agachamento = await createExercise(app, professional.accessToken, { name: `Agachamento ${tag}`, scope: 'private' });
    const media = await prisma.exerciseMedia.create({
      data: { exerciseId: supino.id, storageKey: `exercises/e2e/${tag}/supino.gif`, contentType: 'image/gif', sizeBytes: 10, sha256: 'a'.repeat(64), curationStatus: 'approved', isPrimary: true },
    });
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const v1 = workout.currentVersion.id;
    const base = `/clients/${client.id}/workouts/${workout.id}`;
    const day = (await http().post(`${base}/versions/${v1}/days`).set(auth).send({ name: 'Dia A' }).expect(201)).body;
    const we1 = (await http().post(`${base}/versions/${v1}/days/${day.id}/exercises`).set(auth).send({ exerciseId: supino.id }).expect(201)).body;
    const we2 = (await http().post(`${base}/versions/${v1}/days/${day.id}/exercises`).set(auth).send({ exerciseId: remada.id }).expect(201)).body;
    await http().post(`${base}/versions/${v1}/days/${day.id}/exercises/${we1.id}/sets`).set(auth).send({ reps: 10, restSeconds: 60 }).expect(201);
    await http().post(`${base}/versions/${v1}/days/${day.id}/exercises/${we2.id}/sets`).set(auth).send({ reps: 12 }).expect(201);
    await http().post(`${base}/versions/${v1}/publish`).set(auth).expect(200);
    return { professional, auth, client, temporaryPassword, workout, v1, base, day, we1, we2, supino, remada, agachamento, media };
  }

  it('editar treino publicado: cria rascunho (cópia), edita dias/exercícios/séries e a versão publicada fica intacta até publicar', async () => {
    const { auth, base, v1, supino, agachamento, client, temporaryPassword } = await setupPublished();

    const v2 = (await http().post(`${base}/versions`).set(auth).expect(201)).body;
    expect(v2).toMatchObject({ versionNumber: 2, status: 'draft' });
    expect(v2.days).toHaveLength(1);
    expect(v2.days[0].exercises.map((e: { exercise: { name: string } }) => e.exercise.name)).toEqual([
      expect.stringMatching(/^Supino/),
      expect.stringMatching(/^Remada/),
    ]);
    // Um segundo rascunho não é criado por cima do primeiro.
    await http().post(`${base}/versions`).set(auth).expect(409);

    const day = v2.days[0];
    const [e1, e2] = day.exercises;
    const v2Base = `${base}/versions/${v2.id}/days/${day.id}`;
    await http().patch(v2Base).set(auth).send({ name: 'Dia A — Peito', notes: 'Aquecer bem' }).expect(200);
    await http().patch(`${v2Base}/exercises/${e2.id}`).set(auth).send({ exerciseId: agachamento.id, notes: 'Técnica: descer controlado' }).expect(200);
    await http().patch(`${v2Base}/exercises-order`).set(auth).send({ workoutExerciseIds: [e2.id, e1.id] }).expect(200);
    await http().patch(`${v2Base}/exercises/${e1.id}/sets/${e1.sets[0].id}`).set(auth).send({ reps: null, repsMin: 8, repsMax: 12, restSeconds: 90 }).expect(200);
    await http().post(`${v2Base}/exercises/${e1.id}/sets`).set(auth).send({ reps: 6, restSeconds: 120 }).expect(201);

    const edited = (await http().get(`${base}/versions/${v2.id}`).set(auth).expect(200)).body;
    expect(edited.days[0]).toMatchObject({ name: 'Dia A — Peito', notes: 'Aquecer bem' });
    expect(edited.days[0].exercises.map((e: { exercise: { id: string }; notes: string | null }) => [e.exercise.id, e.notes])).toEqual([
      [agachamento.id, 'Técnica: descer controlado'],
      [supino.id, null],
    ]);
    expect(edited.days[0].exercises[1].sets.map((s: { reps: number | null; repsMin: number | null; repsMax: number | null; restSeconds: number }) => [s.reps, s.repsMin, s.repsMax, s.restSeconds])).toEqual([
      [null, 8, 12, 90],
      [6, null, null, 120],
    ]);
    // GIF do exercício vem do próprio Exercise (URL temporária gerada pela API), nunca do frontend.
    expect(edited.days[0].exercises[1].exercise.imageUrl).toMatch(/X-Amz-Signature/);

    // Publicada continua igual, e é ela que o cliente vê.
    const published = (await http().get(`${base}/versions/${v1}`).set(auth).expect(200)).body;
    expect(published.status).toBe('published');
    expect(published.days[0].name).toBe('Dia A');
    expect(published.days[0].exercises.map((e: { exercise: { name: string } }) => e.exercise.name)).toEqual([
      expect.stringMatching(/^Supino/),
      expect.stringMatching(/^Remada/),
    ]);
    const clientLogin = await http().post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const summary = (await http().get('/client/workout').set({ Authorization: `Bearer ${clientLogin.body.accessToken}` }).expect(200)).body;
    expect(summary.workout.versionId).toBe(v1);
    expect(summary.workout.days[0].name).toBe('Dia A');

    await http().post(`${base}/versions/${v2.id}/publish`).set(auth).expect(200);
    const versions = (await http().get(`${base}/versions`).set(auth).expect(200)).body;
    expect(versions.map((v: { versionNumber: number; status: string }) => [v.versionNumber, v.status]).sort()).toEqual([
      [1, 'superseded'],
      [2, 'published'],
    ]);
  });

  it('não troca para exercício invisível nem aceita ordem que não seja exatamente os itens atuais', async () => {
    const { auth, base } = await setupPublished();
    const other = await registerProfessional(app);
    const foreign = await createExercise(app, other.accessToken, { name: `Privado alheio ${Date.now()}`, scope: 'private' });
    const v2 = (await http().post(`${base}/versions`).set(auth).expect(201)).body;
    const day = v2.days[0];
    const v2Base = `${base}/versions/${v2.id}/days/${day.id}`;

    await http().patch(`${v2Base}/exercises/${day.exercises[0].id}`).set(auth).send({ exerciseId: foreign.id }).expect(404);
    await http().patch(`${v2Base}/exercises-order`).set(auth).send({ workoutExerciseIds: [day.exercises[0].id] }).expect(400);
    await http().patch(`${base}/versions/${v2.id}/days-order`).set(auth).send({ dayIds: [day.id, day.id] }).expect(400);
  });

  it('versão publicada nunca é editada diretamente', async () => {
    const { auth, base, v1, day, we1 } = await setupPublished();
    await http().patch(`${base}/versions/${v1}/days/${day.id}`).set(auth).send({ name: 'x' }).expect(409);
    await http().patch(`${base}/versions/${v1}/days/${day.id}/exercises/${we1.id}`).set(auth).send({ notes: 'x' }).expect(409);
    await http().patch(`${base}/versions/${v1}/days/${day.id}/exercises-order`).set(auth).send({ workoutExerciseIds: [we1.id] }).expect(409);
  });

  it('outro profissional não edita nem exclui o treino (404, sem confiar no clientId da URL)', async () => {
    const { base, v1, day, workout, client } = await setupPublished();
    const intruder = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${intruder.accessToken}` };

    await http().post(`${base}/versions`).set(auth).expect(404);
    await http().patch(`${base}/versions/${v1}/days/${day.id}`).set(auth).send({ name: 'x' }).expect(404);
    await http().patch(`${base}`).set(auth).send({ status: 'archived' }).expect(404);

    // Cliente própria do intruso + workoutId alheio: também 404.
    const { client: own } = await createClient(app, intruder.accessToken);
    await http().patch(`/clients/${own.id}/workouts/${workout.id}`).set(auth).send({ status: 'archived' }).expect(404);
    expect((await prisma.workout.findUniqueOrThrow({ where: { id: workout.id } })).status).toBe('active');
    expect(client.id).toBeTruthy();
  });

  it('excluir treino: arquiva só o treino — cliente, dieta, avaliação, catálogo, ExerciseMedia e GIF ficam intactos; histórico preservado', async () => {
    const { auth, base, client, temporaryPassword, workout, day, we1, supino, remada, media, professional } = await setupPublished();
    await createDiet(app, professional.accessToken, client.id);
    await http().post(`/clients/${client.id}/evaluations`).set(auth).send({ heightCm: 170, weightKg: 70 }).expect(201);

    const clientLogin = await http().post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const clientAuth = { Authorization: `Bearer ${clientLogin.body.accessToken}` };
    await http()
      .post('/client/workout/execution-logs')
      .set(clientAuth)
      .send({ workoutDayId: day.id, sets: [{ workoutExerciseId: we1.id, setOrder: 1, repsPerformed: 10 }] })
      .expect(201);

    const count = async () => ({
      client: await prisma.client.count({ where: { id: client.id } }),
      diets: await prisma.diet.count({ where: { clientId: client.id } }),
      evaluations: await prisma.physicalEvaluation.count({ where: { clientId: client.id } }),
      exercises: await prisma.exercise.count({ where: { id: { in: [supino.id, remada.id] } } }),
      media: await prisma.exerciseMedia.count({ where: { id: media.id, storageKey: media.storageKey } }),
      versions: await prisma.workoutVersion.count({ where: { workoutId: workout.id } }),
      executionLogs: await prisma.workoutExecutionLog.count({ where: { clientId: client.id } }),
    });
    const before = await count();
    expect(before).toMatchObject({ client: 1, diets: 1, evaluations: 1, exercises: 2, media: 1, versions: 1, executionLogs: 1 });

    s3Send.mockClear();
    const archived = await http().patch(base).set(auth).send({ status: 'archived' }).expect(200);
    expect(archived.body.status).toBe('archived');

    expect(await count()).toEqual(before);
    const deletes = s3Send.mock.calls.filter(([command]) => command instanceof DeleteObjectCommand || command instanceof DeleteObjectsCommand);
    expect(deletes).toHaveLength(0);

    // O cliente deixa de ver o treino; o histórico continua acessível (cliente e profissional).
    expect((await http().get('/client/workout').set(clientAuth).expect(200)).body.workout).toBeNull();
    expect((await http().get('/client/workout/execution-logs').set(clientAuth).expect(200)).body.items).toHaveLength(1);
    expect((await http().get(`${base}/execution-logs`).set(auth).expect(200)).body.items).toHaveLength(1);

    // Treino excluído não aceita mais alteração nem nova execução.
    await http().post(`${base}/versions`).set(auth).expect(409);
    await http()
      .post('/client/workout/execution-logs')
      .set(clientAuth)
      .send({ workoutDayId: day.id, sets: [{ workoutExerciseId: we1.id, setOrder: 1, repsPerformed: 8 }] })
      .expect(404);

    // Já excluído → 409; inexistente → 404.
    await http().patch(base).set(auth).send({ status: 'archived' }).expect(409);
    await http().patch(`/clients/${client.id}/workouts/00000000-0000-4000-8000-000000000000`).set(auth).send({ status: 'archived' }).expect(404);

    // Lista ainda traz o treino como arquivado (o painel mostra só os ativos) e dá para criar um novo.
    const list = (await http().get(`/clients/${client.id}/workouts`).set(auth).expect(200)).body;
    expect(list.items.find((w: { id: string }) => w.id === workout.id).status).toBe('archived');
    await http().post(`/clients/${client.id}/workouts`).set(auth).send({}).expect(201);
  });

  it('erro de integridade claro: rascunho com execução registrada não perde dia/exercício (409, não 500)', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken, { name: `Prancha ${Date.now()}`, scope: 'private' });
    const other = await createExercise(app, professional.accessToken, { name: `Outro ${Date.now()}`, scope: 'private' });
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const base = `/clients/${client.id}/workouts/${workout.id}/versions/${workout.currentVersion.id}`;
    const day = (await http().post(`${base}/days`).set(auth).send({ name: 'Dia A' }).expect(201)).body;
    const we = (await http().post(`${base}/days/${day.id}/exercises`).set(auth).send({ exerciseId: exercise.id }).expect(201)).body;
    await http()
      .post(`/clients/${client.id}/workouts/${workout.id}/execution-logs`)
      .set(auth)
      .send({ workoutDayId: day.id, sets: [{ workoutExerciseId: we.id, setOrder: 1, repsPerformed: 1 }] })
      .expect(201);

    const removeExercise = await http().delete(`${base}/days/${day.id}/exercises/${we.id}`).set(auth).expect(409);
    expect(removeExercise.body.message).toMatch(/execuções registradas/);
    await http().delete(`${base}/days/${day.id}`).set(auth).expect(409);
    await http().patch(`${base}/days/${day.id}/exercises/${we.id}`).set(auth).send({ exerciseId: other.id }).expect(409);
  });
});
