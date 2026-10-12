import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAdmin, createClient, createExercise, createWorkout, registerProfessional } from './helpers';

describe('Catálogo de exercícios (e2e)', () => {
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

  it('cria exercício global com tipo e grupo muscular', async () => {
    const professional = await registerProfessional(app);
    const exercise = await createExercise(app, professional.accessToken, {
      name: 'Agachamento livre',
      muscleGroup: 'quadríceps',
      equipment: 'barra',
      type: 'strength',
    });

    expect(exercise.scope).toBe('global');
    expect(exercise.muscleGroup).toBe('quadríceps');
  });

  it('busca do catálogo: por nome, grupo muscular ou equipamento, sem depender de acento; quem bate pelo nome vem primeiro', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const tag = `zq${Date.now()}`;
    const make = (name: string, muscleGroup: string, equipment: string) =>
      createExercise(app, professional.accessToken, { name: `${name} ${tag}`, muscleGroup, equipment, scope: 'private' });
    await make('Tríceps na polia', 'Tríceps', 'Polia alta');
    await make('Supino reto', 'Peitoral, tríceps', 'Barra e anilhas');
    await make('Rosca direta', 'Bíceps', 'Barra W');
    const names = async (search: string) =>
      (await request(app.getHttpServer()).get('/exercises').query({ search }).set(auth).expect(200)).body.map((e: { name: string }) => e.name.replace(` ${tag}`, ''));

    // Sem acento e em outra caixa; o que tem o termo no NOME vem antes do que só tem no grupo muscular.
    expect(await names(`TRICEPS ${tag}`)).toEqual(['Tríceps na polia', 'Supino reto']);
    expect(await names(`peitoral ${tag}`)).toEqual(['Supino reto']);
    expect(await names(`barra ${tag}`)).toEqual(['Rosca direta', 'Supino reto']);
    expect(await names(`polia ${tag}`)).toEqual(['Tríceps na polia']);
    expect(await names(`inexistente ${tag}`)).toEqual([]);
  });

  it('exercício privado não é visível para outro profissional', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const privateExercise = await createExercise(app, professionalA.accessToken, { name: 'Movimento autoral', scope: 'private' });

    await request(app.getHttpServer())
      .get(`/exercises/${privateExercise.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/exercises')
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);
    expect(listB.body.map((e: { id: string }) => e.id)).not.toContain(privateExercise.id);
  });

  it('exercício global recém-criado fica pendente (Fase 15) — só visível a outro profissional depois de aprovado; só o criador pode editar', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const admin = await createAdmin(app);
    const globalExercise = await createExercise(app, professionalA.accessToken, { name: 'Remada curvada' });

    // pendente de moderação: o criador vê, o outro profissional não
    await request(app.getHttpServer())
      .get(`/exercises/${globalExercise.id}`)
      .set('Authorization', `Bearer ${professionalA.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/exercises/${globalExercise.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/admin/moderation/exercises/${globalExercise.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    // aprovado: agora visível a todos, mas só o criador pode editar
    await request(app.getHttpServer())
      .get(`/exercises/${globalExercise.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/exercises/${globalExercise.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ muscleGroup: 'costas' })
      .expect(403);
  });

  it('bloqueia edição de identidade de exercício já usado em treino publicado, mas permite editar descrição', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken, { name: 'Leg press' });
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;

    const day = await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Dia A' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/days/${day.body.id}/exercises`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ exerciseId: exercise.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/exercises/${exercise.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Outro nome qualquer' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/exercises/${exercise.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ description: 'Ajuste o encosto antes de iniciar' })
      .expect(200);
  });
});
