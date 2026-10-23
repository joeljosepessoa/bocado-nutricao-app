import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createExercise, createFood, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Biblioteca de modelos: dieta/treino sem paciente, que pode só ficar guardado ou ser atribuído a um paciente.
describe('Modelos de dieta e treino (e2e)', () => {
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

  const dietContent = (foodId: string, quantity = 150) => ({
    objective: 'Emagrecimento',
    days: [
      {
        label: null,
        meals: [
          {
            name: 'Almoço',
            time: '12:30',
            groups: [{ kind: 'fixed', choices: [{ foods: [{ foodId, customFoodName: 'Arroz branco', quantity, unit: 'g' }] }] }],
          },
          { name: 'Lanche', groups: [{ kind: 'fixed', choices: [{ foods: [{ customFoodName: 'Fruta', quantity: 1, unit: 'unit' }] }] }] },
        ],
      },
    ],
    patientGuidelines: 'Beber 2 L de água por dia.',
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const rice = await createFood(app, professional.accessToken, { name: 'Arroz do teste', kcalPer100: 130 });
    const squat = await createExercise(app, professional.accessToken, { name: 'Agachamento do teste' });
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    return { professional, auth, rice, squat, client, temporaryPassword };
  }

  it('dieta: só criar o modelo (sem paciente), listar e abrir com o nome atual dos alimentos', async () => {
    const { auth, rice, client } = await setup();
    const created = await http()
      .post('/templates/diets')
      .set(auth)
      .send({ name: '  Low carb 1800 kcal ', description: 'Para quem treina de manhã', content: dietContent(rice.id) })
      .expect(201);
    expect(created.body).toMatchObject({ kind: 'diet', name: 'Low carb 1800 kcal', description: 'Para quem treina de manhã', counts: { days: 1, meals: 2 }, deletedAt: null });

    const list = await http().get('/templates/diets').set(auth).expect(200);
    expect(list.body.map((t: { id: string }) => t.id)).toEqual([created.body.id]);
    expect(list.body[0]).not.toHaveProperty('content');

    const opened = await http().get(`/templates/diets/${created.body.id}`).set(auth).expect(200);
    expect(opened.body.content.days[0].meals[0]).toMatchObject({ name: 'Almoço', time: '12:30' });
    expect(opened.body.foods).toEqual([{ id: rice.id, name: 'Arroz do teste' }]);

    // Só criar o modelo não toca em nenhum paciente.
    expect(await prisma.diet.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('dieta: atribuir a um paciente cria RASCUNHO na ficha dele; rascunho aberto só é substituído com confirmação', async () => {
    const { auth, rice, client } = await setup();
    const tpl = await http().post('/templates/diets').set(auth).send({ name: 'Base', content: dietContent(rice.id) }).expect(201);

    const applied = await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(201);
    expect(applied.body.currentVersion).toMatchObject({ versionNumber: 1, status: 'draft', objective: 'Emagrecimento', patientGuidelines: 'Beber 2 L de água por dia.' });
    expect(await prisma.dietVersion.count({ where: { diet: { clientId: client.id }, status: 'published' } })).toBe(0);

    const conflict = await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(409);
    expect(conflict.body.message).toMatch(/Confirme a substituição/);
    await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id, replaceDraft: true }).expect(201);

    // O modelo continua na biblioteca, igual.
    const after = await http().get(`/templates/diets/${tpl.body.id}`).set(auth).expect(200);
    expect(after.body.deletedAt).toBeNull();
  });

  it('dieta: estrutura inválida e alimento de fora do catálogo são recusados ao salvar', async () => {
    const { auth, rice } = await setup();
    const invalid = dietContent(rice.id);
    invalid.days[0].meals[0].groups = [];
    await http().post('/templates/diets').set(auth).send({ name: 'X', content: invalid }).expect(400);
    await http().post('/templates/diets').set(auth).send({ name: '   ', content: dietContent(rice.id) }).expect(400);

    const other = await registerProfessional(app);
    const foreignFood = await createFood(app, other.accessToken, { scope: 'private' });
    await http().post('/templates/diets').set(auth).send({ name: 'X', content: dietContent(foreignFood.id) }).expect(404);
    expect(await prisma.template.count({ where: { name: 'X' } })).toBe(0);
  });

  it('editar, duplicar, lixeira e restaurar', async () => {
    const { auth, rice } = await setup();
    const tpl = await http().post('/templates/diets').set(auth).send({ name: 'Original', content: dietContent(rice.id) }).expect(201);

    const renamed = await http().patch(`/templates/diets/${tpl.body.id}`).set(auth).send({ name: 'Renomeado', content: dietContent(rice.id, 200) }).expect(200);
    expect(renamed.body.name).toBe('Renomeado');
    const copy = await http().post(`/templates/diets/${tpl.body.id}/duplicate`).set(auth).expect(201);
    expect(copy.body.name).toBe('Renomeado (cópia)');
    const copyContent = await http().get(`/templates/diets/${copy.body.id}`).set(auth).expect(200);
    expect(copyContent.body.content.days[0].meals[0].groups[0].choices[0].foods[0].quantity).toBe(200);

    await http().delete(`/templates/diets/${tpl.body.id}`).set(auth).expect(204);
    const active = await http().get('/templates/diets').set(auth).expect(200);
    expect(active.body.map((t: { id: string }) => t.id)).toEqual([copy.body.id]);
    const trash = await http().get('/templates/diets?trash=true').set(auth).expect(200);
    expect(trash.body.map((t: { id: string }) => t.id)).toEqual([tpl.body.id]);
    // Na lixeira não edita nem atribui.
    await http().patch(`/templates/diets/${tpl.body.id}`).set(auth).send({ name: 'Y' }).expect(400);

    await http().post(`/templates/diets/${tpl.body.id}/restore`).set(auth).expect(201);
    const back = await http().get('/templates/diets').set(auth).expect(200);
    expect(back.body).toHaveLength(2);
  });

  it('treino: criar, abrir com os exercícios e atribuir a um paciente (vira treino em rascunho)', async () => {
    const { auth, squat, client } = await setup();
    const content = { objective: 'Hipertrofia', days: [{ name: 'Treino A', exercises: [{ exerciseId: squat.id, sets: [{ reps: 10, restSeconds: 60 }, { repsMin: 8, repsMax: 12 }] }] }] };
    const tpl = await http().post('/templates/workouts').set(auth).send({ name: 'ABC iniciante', content }).expect(201);
    expect(tpl.body).toMatchObject({ kind: 'workout', counts: { days: 1, exercises: 1 } });

    const opened = await http().get(`/templates/workouts/${tpl.body.id}`).set(auth).expect(200);
    expect(opened.body.exercises).toEqual([expect.objectContaining({ id: squat.id, name: 'Agachamento do teste' })]);

    // Treino de modelo não aparece na lista de dietas (tipos separados).
    await http().get(`/templates/diets/${tpl.body.id}`).set(auth).expect(404);

    await http().post(`/templates/workouts/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(201);
    const versions = await prisma.workoutVersion.findMany({ where: { workout: { clientId: client.id } } });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ status: 'draft', objective: 'Hipertrofia' });

    await http().post('/templates/workouts').set(auth).send({ name: 'Ruim', content: { days: [{ name: 'A', exercises: [{ exerciseId: squat.id, sets: [{ reps: 10, repsMin: 8 }] }] }] } }).expect(400);
  });

  it('"Salvar como modelo": a dieta e o treino do paciente voltam para a biblioteca iguais', async () => {
    const { professional, auth, rice, squat, client } = await setup();
    const content = dietContent(rice.id);
    const tpl = await http().post('/templates/diets').set(auth).send({ name: 'Origem', content }).expect(201);
    await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(201);

    const saved = await http().post('/templates/diets/from-client').set(auth).send({ clientId: client.id, name: 'Da ficha' }).expect(201);
    const back = await http().get(`/templates/diets/${saved.body.id}`).set(auth).expect(200);
    const meals = back.body.content.days[0].meals;
    expect(back.body.content.objective).toBe('Emagrecimento');
    expect(meals.map((m: { name: string }) => m.name)).toEqual(['Almoço', 'Lanche']);
    expect(meals[0].groups[0].choices[0].foods[0]).toEqual({ foodId: rice.id, customFoodName: 'Arroz branco', quantity: 150, unit: 'g', notes: null });
    expect(back.body.content.patientGuidelines).toBe('Beber 2 L de água por dia.');

    const workout = { days: [{ name: 'Treino A', notes: null, exercises: [{ exerciseId: squat.id, notes: 'Desce devagar', sets: [{ reps: 10, restSeconds: 60 }] }] }] };
    const wt = await http().post('/templates/workouts').set(auth).send({ name: 'Treino origem', content: workout }).expect(201);
    await http().post(`/templates/workouts/${wt.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(201);
    const wSaved = await http().post('/templates/workouts/from-client').set(auth).send({ clientId: client.id, name: 'Treino da ficha' }).expect(201);
    const wBack = await http().get(`/templates/workouts/${wSaved.body.id}`).set(auth).expect(200);
    expect(wBack.body.content.days[0]).toMatchObject({ name: 'Treino A', exercises: [{ exerciseId: squat.id, notes: 'Desce devagar', sets: [{ reps: 10, restSeconds: 60, repsMin: null }] }] });

    // Paciente sem dieta: explica; paciente de outro profissional: 404.
    const { client: empty } = await createClient(app, (await registerProfessional(app)).accessToken);
    await http().post('/templates/diets/from-client').set(auth).send({ clientId: empty.id, name: 'X' }).expect(404);
    const { client: mine } = await createClient(app, professional.accessToken);
    const none = await http().post('/templates/diets/from-client').set(auth).send({ clientId: mine.id, name: 'X' }).expect(400);
    expect(none.body.message).toMatch(/ainda não tem dieta/);
  });

  it('isolamento: outro profissional não vê, não abre e não usa o modelo; paciente de outro profissional não recebe', async () => {
    const { auth, rice, temporaryPassword, client } = await setup();
    const tpl = await http().post('/templates/diets').set(auth).send({ name: 'Meu', content: dietContent(rice.id) }).expect(201);

    const intruder = await registerProfessional(app);
    const intruderAuth = { Authorization: `Bearer ${intruder.accessToken}` };
    expect((await http().get('/templates/diets').set(intruderAuth).expect(200)).body).toEqual([]);
    await http().get(`/templates/diets/${tpl.body.id}`).set(intruderAuth).expect(404);
    await http().patch(`/templates/diets/${tpl.body.id}`).set(intruderAuth).send({ name: 'Hack' }).expect(404);
    await http().delete(`/templates/diets/${tpl.body.id}`).set(intruderAuth).expect(404);
    const { client: intruderClient } = await createClient(app, intruder.accessToken);
    await http().post(`/templates/diets/${tpl.body.id}/apply`).set(intruderAuth).send({ clientId: intruderClient.id }).expect(404);
    // O dono não atribui a paciente que não é dele.
    await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: intruderClient.id }).expect(404);

    const session = await login(app, client.user.email, temporaryPassword);
    await http().get('/templates/diets').set('Authorization', `Bearer ${session.accessToken}`).expect(403);
    await http().get('/templates/workouts').expect(401);
  });
});
