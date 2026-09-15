import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createExercise, createWorkout, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

async function addDayWithExercise(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  workoutId: string,
  versionId: string,
  exerciseId: string,
  dayName = 'Dia A',
) {
  const day = await request(app.getHttpServer())
    .post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: dayName })
    .expect(201);

  const workoutExercise = await request(app.getHttpServer())
    .post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${day.body.id}/exercises`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ exerciseId })
    .expect(201);

  return { day: day.body, workoutExercise: workoutExercise.body };
}

describe('Treinos (e2e)', () => {
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

  // 1. Criação
  it('cria treino com primeira versão em rascunho (v1)', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id, { objective: 'Hipertrofia' });

    expect(workout.status).toBe('active');
    expect(workout.currentVersion.versionNumber).toBe(1);
    expect(workout.currentVersion.status).toBe('draft');
    expect(workout.currentVersion.objective).toBe('Hipertrofia');
  });

  // 2. Edição
  it('edita rascunho livremente; edição de versão publicada retorna 409', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'Foco em membros superiores' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'Tentativa indevida' })
      .expect(409);
  });

  // 3. Publicação
  it('publica um rascunho; publicar de novo a mesma versão retorna 409', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;

    const published = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(published.body.status).toBe('published');
    expect(published.body.publishedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);
  });

  // 4. Imutabilidade (mutação em versão publicada)
  it('bloqueia adicionar dia/exercício/série numa versão publicada', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { day } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Dia B' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ exerciseId: exercise.id })
      .expect(409);
  });

  // 5. Versionamento
  it('nova versão clona fielmente dias/exercícios/séries; a versão antiga permanece intacta e vira superseded', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id, { notes: 'v1' });
    const v1Id = workout.currentVersion.id;
    const { day, workoutExercise } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, v1Id, exercise.id);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}/days/${day.id}/exercises/${workoutExercise.id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ reps: 12, loadValue: 40, loadUnit: 'kg' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const v2 = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(201);
    expect(v2.body.versionNumber).toBe(2);
    expect(v2.body.days).toHaveLength(1);
    expect(v2.body.days[0].exercises).toHaveLength(1);
    expect(v2.body.days[0].exercises[0].sets).toHaveLength(1);
    expect(v2.body.days[0].exercises[0].sets[0].reps).toBe(12);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/workouts/${workout.id}/versions/${v2.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'v2 editada' })
      .expect(200);

    const v1After = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(v1After.body.notes).toBe('v1');
    expect(v1After.body.days).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v2.body.id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const v1Final = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(v1Final.body.status).toBe('superseded');
  });

  // 6. Exercícios (coberto em exercises.e2e-spec.ts) — reforço de listagem/tipo
  it('filtra catálogo de exercícios por tipo', async () => {
    const professional = await registerProfessional(app);
    await createExercise(app, professional.accessToken, { name: 'Corrida contínua', type: 'cardio' });
    await createExercise(app, professional.accessToken, { name: 'Supino inclinado', type: 'strength' });

    const res = await request(app.getHttpServer())
      .get('/exercises?type=cardio')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.every((e: { type: string }) => e.type === 'cardio')).toBe(true);
  });

  // 7. Séries — padrão piramidal
  it('permite séries com carga/repetição diferentes entre si no mesmo exercício', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { day, workoutExercise } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);

    const base = `/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises/${workoutExercise.id}/sets`;
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${professional.accessToken}`).send({ reps: 12, loadValue: 40 }).expect(201);
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${professional.accessToken}`).send({ reps: 10, loadValue: 45 }).expect(201);
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${professional.accessToken}`).send({ reps: 8, loadValue: 50 }).expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    const sets = detail.body.days[0].exercises[0].sets;
    expect(sets).toHaveLength(3);
    expect(sets.map((s: { loadValue: number }) => s.loadValue)).toEqual([40, 45, 50]);
  });

  // 8. Diferentes tipos de exercício
  it('série de cardio aceita duração/distância sem repetições ou carga', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken, { name: 'Bicicleta', type: 'cardio' });
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { day, workoutExercise } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises/${workoutExercise.id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ durationSeconds: 1200, distanceMeters: 3000 })
      .expect(201);

    expect(res.body.reps).toBeNull();
    expect(res.body.loadValue).toBeNull();
    expect(res.body.durationSeconds).toBe(1200);
    expect(res.body.distanceMeters).toBe(3000);
  });

  // 9. Isolamento entre profissionais
  it('profissional B não acessa treino de cliente do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    const workout = await createWorkout(app, professionalA.accessToken, client.id);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 10. Isolamento entre clientes (role=client bloqueado inteiramente)
  it('cliente autenticado recebe 403 em todas as rotas de treino', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const clientSession = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${clientSession.accessToken}` };

    await request(app.getHttpServer()).get(`/clients/${client.id}/workouts`).set(auth).expect(403);
    await request(app.getHttpServer()).get(`/clients/${client.id}/workouts/${workout.id}`).set(auth).expect(403);
    await request(app.getHttpServer()).post(`/clients/${client.id}/workouts`).set(auth).send({}).expect(403);
  });

  // 12. Histórico de execução separado da prescrição
  it('registrar execução com valores diferentes da prescrição não altera a prescrição original', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { day, workoutExercise } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises/${workoutExercise.id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ reps: 12, loadValue: 40 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const log = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/execution-logs`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({
        workoutDayId: day.id,
        sets: [{ workoutExerciseId: workoutExercise.id, setOrder: 1, repsPerformed: 8, loadValue: 35, perceivedEffort: 9 }],
      })
      .expect(201);
    expect(log.body.sets[0].repsPerformed).toBe(8);

    const versionAfter = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(versionAfter.body.days[0].exercises[0].sets[0].reps).toBe(12);
    expect(versionAfter.body.days[0].exercises[0].sets[0].loadValue).toBe(40);
  });

  // 13. Auditoria
  it('registra ações de auditoria sem armazenar carga, repetição ou nome de exercício', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const logs = await prisma.workoutAuditLog.findMany({ where: { workoutId: workout.id } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['created', 'day_added', 'exercise_added', 'read']));
    for (const log of logs) {
      const keys = Object.keys(log);
      expect(keys).not.toContain('reps');
      expect(keys).not.toContain('loadValue');
      expect(keys).not.toContain('exerciseName');
    }
  });

  // 14. Validações
  it('rejeita repetição/carga negativa, exerciseId inexistente e segundo draft em paralelo', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { day, workoutExercise } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, versionId, exercise.id);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises/${workoutExercise.id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ reps: -5 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.id}/exercises`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ exerciseId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);
  });

  // Extra — comparação de versões
  it('compara duas versões e devolve deltas de volume por exercício', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const v1Id = workout.currentVersion.id;
    const { day: day1, workoutExercise: we1 } = await addDayWithExercise(app, professional.accessToken, client.id, workout.id, v1Id, exercise.id);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}/days/${day1.id}/exercises/${we1.id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ reps: 10, loadValue: 40 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v1Id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const v2 = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(201);
    const day2Id = v2.body.days[0].id;
    const we2Id = v2.body.days[0].exercises[0].id;
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${v2.body.id}/days/${day2Id}/exercises/${we2Id}/sets`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ reps: 10, loadValue: 45 })
      .expect(201);

    const compare = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/compare?from=${v1Id}&to=${v2.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const entry = compare.body.exerciseVolumeDeltas.find((d: { exerciseId: string }) => d.exerciseId === exercise.id);
    expect(entry.fromVolume).toBe(400);
    expect(entry.toVolume).toBe(450 + 400);
    expect(entry.delta).toBe(450);
  });
});
