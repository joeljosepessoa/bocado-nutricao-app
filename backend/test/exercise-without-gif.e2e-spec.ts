import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SYSTEM_PROFESSIONAL_EMAIL } from '../src/reference-data/import-reference-data';
import { createClient, createExercise, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Tela "Sem GIF": exercício particular ganha o GIF de um exercício da biblioteca sem mudar nome nem treinos.
describe('Exercícios sem GIF (e2e)', () => {
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

  it('lista, liga o GIF da biblioteca (treino intacto, grupos preenchidos) e desfaz', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const tag = `Zg${Date.now().toString(36)}`;
    const system = await prisma.user.findUniqueOrThrow({ where: { email: SYSTEM_PROFESSIONAL_EMAIL } });
    const official = await prisma.exercise.create({
      data: {
        name: `${tag} Cadeira Abdutora`,
        type: 'strength',
        scope: 'global',
        approvedAt: new Date(),
        createdByProfessionalId: system.id,
        muscleGroup: 'Glúteos',
        muscleGroups: ['Glúteos', 'Abdutores'],
        equipment: 'Máquina',
        section: 'ACADEMIA / TESTE',
        media: { create: { storageKey: `exercises/TESTE/${tag}.gif`, contentType: 'image/gif', sizeBytes: 1234, curationStatus: 'approved', isPrimary: true } },
      },
    });
    const own = await createExercise(app, professional.accessToken, { name: `${tag} Cadeira abdutora (3 s de contração no pico)`, scope: 'private' });
    const { client } = await createClient(app, professional.accessToken);
    const workout = await http()
      .post(`/clients/${client.id}/workouts/from-proposal`)
      .set(auth)
      .send({ days: [{ name: 'Treino A', exercises: [{ exerciseId: own.id, sets: [{ reps: 12 }] }] }] })
      .expect(201);
    await http().post(`/clients/${client.id}/workouts/${workout.body.id}/versions/${workout.body.currentVersion.id}/publish`).set(auth).expect(200);

    const listed = await http().get('/exercises/without-gif').set(auth).expect(200);
    const item = listed.body.items.find((i: { id: string }) => i.id === own.id);
    expect(item).toMatchObject({ name: `${tag} Cadeira abdutora (3 s de contração no pico)`, uses: 1, clients: 1 });
    expect(item.suggestions[0]).toMatchObject({ id: official.id, name: `${tag} Cadeira Abdutora`, section: 'ACADEMIA / TESTE' });

    // Outro profissional não mexe; exercício que não é da biblioteca (ou sem GIF) não serve de origem.
    const other = await registerProfessional(app);
    await http().post(`/exercises/${own.id}/gif`).set({ Authorization: `Bearer ${other.accessToken}` }).send({ fromExerciseId: official.id }).expect(404);
    await http().post(`/exercises/${own.id}/gif`).set(auth).send({ fromExerciseId: own.id }).expect(404);

    const linked = await http().post(`/exercises/${own.id}/gif`).set(auth).send({ fromExerciseId: official.id }).expect(200);
    expect(linked.body.fromExercise).toEqual({ id: official.id, name: `${tag} Cadeira Abdutora` });
    const media = await prisma.exerciseMedia.findMany({ where: { exerciseId: own.id } });
    expect(media).toEqual([expect.objectContaining({ storageKey: `exercises/TESTE/${tag}.gif`, curationStatus: 'approved', isPrimary: true })]);
    const after = await prisma.exercise.findUniqueOrThrow({ where: { id: own.id } });
    expect(after).toMatchObject({ name: own.name, muscleGroup: 'Glúteos', muscleGroups: ['Glúteos', 'Abdutores'], equipment: 'Máquina', scope: 'private' });
    const prescribed = await prisma.workoutExercise.findMany({ where: { workoutDay: { workoutVersion: { workoutId: workout.body.id } } } });
    expect(prescribed.map((p) => p.exerciseId)).toEqual([own.id]);
    // O GIF do exercício da biblioteca continua lá.
    expect(await prisma.exerciseMedia.count({ where: { exerciseId: official.id } })).toBe(1);

    const again = await http().get('/exercises/without-gif').set(auth).expect(200);
    expect(again.body.items.some((i: { id: string }) => i.id === own.id)).toBe(false);

    await http().delete(`/exercises/${own.id}/gif`).set(auth).expect(204);
    expect(await prisma.exerciseMedia.count({ where: { exerciseId: own.id } })).toBe(0);
    await http().delete(`/exercises/${own.id}/gif`).set(auth).expect(404);
    const back = await http().get('/exercises/without-gif').set(auth).expect(200);
    expect(back.body.items.some((i: { id: string }) => i.id === own.id)).toBe(true);
  });
});
