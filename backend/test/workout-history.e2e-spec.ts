import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, createExercise, login, registerProfessional } from './helpers';

// Painel: histórico de treino do paciente — sessões com as séries feitas, de todas as versões da ficha.
describe('Histórico de treino no painel (e2e)', () => {
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
  });

  it('mostra as sessões (mais recente primeiro) com dia, exercícios na ordem da ficha e séries; só para o dono', async () => {
    const professional = await registerProfessional(app);
    const proAuth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const squat = await createExercise(app, professional.accessToken, { name: 'Agachamento sumô' });
    const curl = await createExercise(app, professional.accessToken, { name: 'Mesa flexora' });
    const created = await http()
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(proAuth)
      .send({ days: [{ name: 'Treino A', exercises: [{ exerciseId: squat.id, sets: [{ reps: 12 }, { reps: 10 }] }, { exerciseId: curl.id, sets: [{ reps: 15 }] }] }] })
      .expect(201);
    await http().post(`/clients/${client.id}/workouts/${created.body.id}/versions/${created.body.currentVersion.id}/publish`).set(proAuth).expect(200);

    const empty = await http().get(`/clients/${client.id}/workouts/history`).set(proAuth).expect(200);
    expect(empty.body).toEqual({ sessions: [], total: 0 });

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const day = (await http().get('/client/workout').set(auth).expect(200)).body.workout.days[0];
    const [sq, cu] = day.exercises;
    const log = (performedAt: string, squatLoad: number) =>
      http()
        .post('/client/workout/execution-logs')
        .set(auth)
        .send({
          workoutDayId: day.workoutDayId,
          performedAt,
          sets: [
            { workoutExerciseId: cu.workoutExerciseId, setOrder: 0, repsPerformed: 15, loadValue: 20, loadUnit: 'kg' },
            { workoutExerciseId: sq.workoutExerciseId, setOrder: 1, repsPerformed: 10, loadValue: squatLoad + 2.5, loadUnit: 'kg' },
            { workoutExerciseId: sq.workoutExerciseId, setOrder: 0, repsPerformed: 12, loadValue: squatLoad, loadUnit: 'kg' },
          ],
        })
        .expect(201);
    await log('2026-10-20T22:00:00.000Z', 20);
    await log('2026-10-27T22:00:00.000Z', 25);

    const history = await http().get(`/clients/${client.id}/workouts/history`).set(proAuth).expect(200);
    expect(history.body.total).toBe(2);
    expect(history.body.sessions.map((s: { performedAt: string }) => s.performedAt)).toEqual(['2026-10-27T22:00:00.000Z', '2026-10-20T22:00:00.000Z']);
    expect(history.body.sessions[0]).toMatchObject({
      dayName: 'Treino A',
      versionNumber: 1,
      loggedBy: 'client',
      exercises: [
        {
          exerciseId: squat.id,
          name: 'Agachamento sumô',
          sets: [
            { setOrder: 0, reps: 12, loadValue: 25, loadUnit: 'kg' },
            { setOrder: 1, reps: 10, loadValue: 27.5, loadUnit: 'kg' },
          ],
        },
        { exerciseId: curl.id, name: 'Mesa flexora', sets: [{ setOrder: 0, reps: 15, loadValue: 20, loadUnit: 'kg' }] },
      ],
    });
    const limited = await http().get(`/clients/${client.id}/workouts/history`).query({ limit: 1 }).set(proAuth).expect(200);
    expect(limited.body.sessions).toHaveLength(1);
    expect(limited.body.total).toBe(2);

    const other = await registerProfessional(app);
    await http().get(`/clients/${client.id}/workouts/history`).set({ Authorization: `Bearer ${other.accessToken}` }).expect(404);
  });
});
