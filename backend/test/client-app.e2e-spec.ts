import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import {
  createClient,
  createDiet,
  createExercise,
  createFood,
  createWorkout,
  login,
  registerProfessional,
} from './helpers';

const prisma = new PrismaClient();

async function addMealWithFood(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  dietId: string,
  versionId: string,
  foodId: string,
) {
  const meal = await request(app.getHttpServer())
    .post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Almoço' })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${meal.body.id}/foods`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ foodId, quantity: 100, unit: 'g' })
    .expect(201);

  return meal.body;
}

async function addDayWithExercise(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  workoutId: string,
  versionId: string,
  exerciseId: string,
) {
  const day = await request(app.getHttpServer())
    .post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Dia A' })
    .expect(201);

  const workoutExercise = await request(app.getHttpServer())
    .post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${day.body.id}/exercises`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ exerciseId })
    .expect(201);

  return { day: day.body, workoutExercise: workoutExercise.body };
}

describe('Aplicativo do cliente (e2e)', () => {
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

  // 1. Login / sessão
  it('login do cliente retorna mustChangePassword=true e privacyAcceptedAt=null na primeira sessão', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);

    const session = await login(app, client.user.email, temporaryPassword);

    expect(session.user.role).toBe('client');
    expect(session.user.mustChangePassword).toBe(true);
    expect(session.user.privacyAcceptedAt).toBeNull();
  });

  // 2. Um profissional autenticado não pode usar as rotas /client/*
  it('bloqueia profissional autenticado nas rotas /client/*', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .get('/client/me')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(403);
  });

  // 3. Perfil — GET/PATCH /client/me
  it('cliente lê e atualiza o próprio perfil, mas só fullName e phone', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken, {
      fullName: 'Nome Original',
    });
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const me = await request(app.getHttpServer()).get('/client/me').set(auth).expect(200);
    expect(me.body.user.fullName).toBe('Nome Original');

    const updated = await request(app.getHttpServer())
      .patch('/client/me')
      .set(auth)
      .send({ fullName: 'Nome Atualizado', phone: '11999998888' })
      .expect(200);
    expect(updated.body.user.fullName).toBe('Nome Atualizado');
    expect(updated.body.phone).toBe('11999998888');

    // e-mail não faz parte do allowlist do PATCH /client/me
    await request(app.getHttpServer())
      .patch('/client/me')
      .set(auth)
      .send({ email: 'outro@example.com' })
      .expect(400);
  });

  // 4. Minha Dieta — sem prescrição publicada
  it('GET /client/diet retorna null quando não há versão publicada', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);

    const res = await request(app.getHttpServer())
      .get('/client/diet')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(res.body.diet).toBeNull();
  });

  // 5. Minha Dieta — com prescrição publicada, sem dado técnico
  it('GET /client/diet expõe a versão publicada com substituições, nunca dado técnico', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, { name: 'Arroz branco cozido' });
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;
    await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const session = await login(app, client.user.email, temporaryPassword);
    const res = await request(app.getHttpServer())
      .get('/client/diet')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(res.body.diet.dietId).toBe(diet.id);
    expect(res.body.diet.meals).toHaveLength(1);
    expect(res.body.diet.meals[0].foods[0].foodName).toBe('Arroz branco cozido');
    expect(res.body.diet.meals[0].foods[0].substitutions).toEqual([]);
    expect(res.body.diet).not.toHaveProperty('professionalId');
  });

  // 6. Meu Treino + execução separada da prescrição
  it('GET /client/workout expõe a versão publicada; execução não altera a prescrição', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const exercise = await createExercise(app, professional.accessToken, { name: 'Supino reto' });
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const { workoutExercise } = await addDayWithExercise(
      app,
      professional.accessToken,
      client.id,
      workout.id,
      versionId,
      exercise.id,
    );
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const clientWorkout = await request(app.getHttpServer()).get('/client/workout').set(auth).expect(200);
    expect(clientWorkout.body.workout.workoutId).toBe(workout.id);
    expect(clientWorkout.body.workout.days[0].exercises[0].workoutExerciseId).toBe(workoutExercise.id);

    const log = await request(app.getHttpServer())
      .post('/client/workout/execution-logs')
      .set(auth)
      .send({
        workoutDayId: clientWorkout.body.workout.days[0].workoutDayId,
        sets: [{ workoutExerciseId: workoutExercise.id, setOrder: 1, repsPerformed: 10, loadValue: 20, loadUnit: 'kg' }],
      })
      .expect(201);
    expect(log.body.sets).toHaveLength(1);

    // A versão publicada continua com o mesmo conteúdo prescrito
    const versionAfter = await request(app.getHttpServer())
      .get(`/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(versionAfter.body.days[0].exercises[0].sets).toHaveLength(0);

    const list = await request(app.getHttpServer()).get('/client/workout/execution-logs').set(auth).expect(200);
    expect(list.body.total).toBe(1);
  });

  // 7. Isolamento entre clientes
  it('cliente A não vê treino nem dieta do cliente B', async () => {
    const professional = await registerProfessional(app);
    const clientA = await createClient(app, professional.accessToken);
    const clientB = await createClient(app, professional.accessToken);

    const exercise = await createExercise(app, professional.accessToken);
    const workoutB = await createWorkout(app, professional.accessToken, clientB.client.id);
    await addDayWithExercise(
      app,
      professional.accessToken,
      clientB.client.id,
      workoutB.id,
      workoutB.currentVersion.id,
      exercise.id,
    );
    await request(app.getHttpServer())
      .post(`/clients/${clientB.client.id}/workouts/${workoutB.id}/versions/${workoutB.currentVersion.id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const sessionA = await login(app, clientA.client.user.email, clientA.temporaryPassword);
    const resWorkout = await request(app.getHttpServer())
      .get('/client/workout')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .expect(200);
    expect(resWorkout.body.workout).toBeNull();
  });

  // 8. Evolução restrita — só avaliações liberadas; backend filtra na query, nunca só na UI
  it('GET /client/evolution: avaliação não liberada não aparece; liberada aparece com composição/medidas, nunca dado técnico (Fase 8)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);

    const evaluation = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({
        heightCm: 178,
        weightKg: 80,
        protocolCode: 'jackson_pollock_7',
        biologicalSexForCalculation: 'male',
        ageAtEvaluation: 30,
        bloodPressureSystolic: 120,
        bloodPressureDiastolic: 80,
        heartRate: 70,
        glucose: 90,
        notes: 'Nota clínica confidencial',
        measurements: { waistCm: 85, hipCm: 100, chestCm: 100, armRightCm: 32 },
        skinfolds: {
          chestMm: 8,
          axillaryMidMm: 10,
          tricepsMm: 9,
          subscapularMm: 12,
          abdominalMm: 15,
          suprailiacMm: 11,
          thighMm: 14,
        },
        bioimpedance: { muscleMassKg: 32, bodyWaterPercent: 55, visceralFatLevel: 8, boneMassKg: 3.1 },
      })
      .expect(201);

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    // 5. Cliente com avaliação NÃO liberada: nada aparece — backend filtra na
    // query (releasedToClientAt), não é só escondido na UI.
    const beforeRelease = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(beforeRelease.body.total).toBe(0);
    expect(beforeRelease.body.items).toEqual([]);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/evaluations/${evaluation.body.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);

    // 6. Cliente com avaliação liberada: composição + medidas aparecem
    const afterRelease = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(afterRelease.body.total).toBe(1);
    const item = afterRelease.body.items[0];
    expect(item.id).toBe(evaluation.body.id);
    expect(item.weightKg).toBe(80);
    expect(item.bmiClassification).toBe('sobrepeso');
    expect(item.measurements).toEqual(
      expect.objectContaining({ waistCm: 85, hipCm: 100, chestCm: 100, armRightCm: 32 }),
    );
    expect(item.composition).toEqual(
      expect.objectContaining({ muscleMassKg: 32, bodyWaterPercent: 55, visceralFatLevel: 8, boneMassKg: 3.1 }),
    );

    // 11. Nenhum campo técnico/clínico proibido, em nenhum nível do payload
    const keys = Object.keys(item);
    expect(keys).not.toContain('skinfolds');
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('protocol');
    expect(keys).not.toContain('bloodPressureSystolic');
    expect(keys).not.toContain('bloodPressureDiastolic');
    expect(keys).not.toContain('heartRate');
    expect(keys).not.toContain('glucose');
    expect(keys).not.toContain('bodyFatPercentSource');
    const compositionKeys = Object.keys(item.composition);
    expect(compositionKeys).not.toContain('origin');
    expect(compositionKeys).not.toContain('segmentalData');
    expect(compositionKeys).not.toContain('impedanceData');
    expect(compositionKeys).not.toContain('recordedAt');
  });

  // Retirar liberação some da evolução já apresentada, não só de novas leituras
  it('retirar a liberação (release: false) faz a avaliação sumir de /client/evolution na leitura seguinte', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const evaluation = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 178, weightKg: 80 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/evaluations/${evaluation.body.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);

    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const released = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(released.body.total).toBe(1);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/evaluations/${evaluation.body.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: false })
      .expect(200);

    const revoked = await request(app.getHttpServer()).get('/client/evolution').set(auth).expect(200);
    expect(revoked.body.total).toBe(0);
  });

  // 7. Isolamento entre clientes, estendido à evolução
  it('cliente A não vê a evolução de cliente B, mesmo com avaliação liberada', async () => {
    const professional = await registerProfessional(app);
    const clientA = await createClient(app, professional.accessToken);
    const clientB = await createClient(app, professional.accessToken);

    const evaluationB = await request(app.getHttpServer())
      .post(`/clients/${clientB.client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 165, weightKg: 60 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/clients/${clientB.client.id}/evaluations/${evaluationB.body.id}/release`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ released: true })
      .expect(200);

    const sessionA = await login(app, clientA.client.user.email, clientA.temporaryPassword);
    const resA = await request(app.getHttpServer())
      .get('/client/evolution')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .expect(200);
    expect(resA.body.total).toBe(0);
    expect(resA.body.items).toEqual([]);
  });

  // 9. Relatórios — Fase 9: lista real, vazia quando não há relatório liberado
  it('GET /client/reports retorna lista vazia quando não há relatório de cliente liberado', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);

    const res = await request(app.getHttpServer())
      .get('/client/reports')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  // 10. Privacidade — aceite obrigatório no primeiro acesso
  it('POST /client/accept-privacy-terms grava privacyAcceptedAt', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await request(app.getHttpServer()).post('/client/accept-privacy-terms').set(auth).expect(204);

    const nextLogin = await login(app, client.user.email, temporaryPassword);
    expect(nextLogin.user.privacyAcceptedAt).not.toBeNull();
  });

  // 11. Reset de senha pelo profissional
  it('POST /professionals/me/clients/:id/reset-password força troca de senha e revoga sessões', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const firstSession = await login(app, client.user.email, temporaryPassword);

    const reset = await request(app.getHttpServer())
      .post(`/professionals/me/clients/${client.id}/reset-password`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(201);
    expect(reset.body.temporaryPassword).toBeDefined();
    expect(reset.body.temporaryPassword).not.toBe(temporaryPassword);

    // Refresh token emitido antes do reset deixa de funcionar
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstSession.refreshToken })
      .expect(401);

    // Senha antiga não funciona mais; a nova sim, com mustChangePassword=true
    await login(app, client.user.email, temporaryPassword).catch(() => undefined);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(401);

    const newSession = await login(app, client.user.email, reset.body.temporaryPassword);
    expect(newSession.user.mustChangePassword).toBe(true);
  });

  // 12. Um cliente não acessa a avaliação física técnica completa (sem release), mesmo por rota de evolução
  it('cliente não consegue ler avaliação técnica completa via rota client-facing', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ heightCm: 178, weightKg: 80, notes: 'Nota clínica confidencial' })
      .expect(201);

    const session = await login(app, client.user.email, temporaryPassword);
    // Não existe rota client-facing para o recurso técnico completo.
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });
});
