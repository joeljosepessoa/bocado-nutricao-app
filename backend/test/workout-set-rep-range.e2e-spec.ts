import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, createExercise, createWorkout, registerProfessional } from './helpers';

// Faixa de repetições (repsMin/repsMax) — a prescrição exata continua em
// `reps`; nenhuma das formas é convertida na outra pelo backend.
describe('Faixa de repetições em séries de treino (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupExercise() {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const base = `/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`;
    const day = await request(app.getHttpServer()).post(`${base}/days`).set(auth).send({ name: 'Dia A' }).expect(201);
    const we = await request(app.getHttpServer())
      .post(`${base}/days/${day.body.id}/exercises`)
      .set(auth)
      .send({ exerciseId: exercise.id })
      .expect(201);
    const setsUrl = `${base}/days/${day.body.id}/exercises/${we.body.id}/sets`;
    return { professional, client, workout, versionId, auth, base, setsUrl };
  }

  it('grava faixa como repsMin/repsMax, sem preencher reps', async () => {
    const { auth, setsUrl } = await setupExercise();
    const res = await request(app.getHttpServer()).post(setsUrl).set(auth).send({ repsMin: 6, repsMax: 10, restSeconds: 90 }).expect(201);
    expect(res.body).toMatchObject({ reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 });
  });

  it('prescrição exata continua usando só reps', async () => {
    const { auth, setsUrl } = await setupExercise();
    const res = await request(app.getHttpServer()).post(setsUrl).set(auth).send({ reps: 12 }).expect(201);
    expect(res.body).toMatchObject({ reps: 12, repsMin: null, repsMax: null });
  });

  it('rejeita reps junto com faixa, faixa incompleta e mínimo > máximo (400)', async () => {
    const { auth, setsUrl } = await setupExercise();
    await request(app.getHttpServer()).post(setsUrl).set(auth).send({ reps: 8, repsMin: 6, repsMax: 10 }).expect(400);
    await request(app.getHttpServer()).post(setsUrl).set(auth).send({ repsMin: 6 }).expect(400);
    await request(app.getHttpServer()).post(setsUrl).set(auth).send({ repsMin: 12, repsMax: 8 }).expect(400);
  });

  it('atualização: trocar exata por faixa exige limpar reps; o estado mesclado é validado', async () => {
    const { auth, setsUrl } = await setupExercise();
    const created = await request(app.getHttpServer()).post(setsUrl).set(auth).send({ reps: 12 }).expect(201);

    await request(app.getHttpServer()).patch(`${setsUrl}/${created.body.id}`).set(auth).send({ repsMin: 6, repsMax: 10 }).expect(400);

    const updated = await request(app.getHttpServer())
      .patch(`${setsUrl}/${created.body.id}`)
      .set(auth)
      .send({ reps: null, repsMin: 6, repsMax: 10 })
      .expect(200);
    expect(updated.body).toMatchObject({ reps: null, repsMin: 6, repsMax: 10 });
  });

  it('nova versão clona a faixa da versão publicada sem perdê-la', async () => {
    const { client, workout, versionId, auth, setsUrl } = await setupExercise();
    await request(app.getHttpServer()).post(setsUrl).set(auth).send({ repsMin: 8, repsMax: 12 }).expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set(auth)
      .expect(200);

    const v2 = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set(auth)
      .expect(201);
    const clonedSet = v2.body.days[0].exercises[0].sets[0];
    expect(clonedSet).toMatchObject({ reps: null, repsMin: 8, repsMax: 12 });
  });
});
