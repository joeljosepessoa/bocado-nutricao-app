import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createDiet, createWorkout, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

const FORM = {
  name: 'Check-in da lixeira',
  questions: [{ id: 'fome', type: 'scale', label: 'Fome', required: true }],
};

const DIET_TEMPLATE = {
  name: 'Modelo da lixeira',
  content: {
    objective: 'Manutenção',
    days: [{ label: null, meals: [{ name: 'Lanche', groups: [{ kind: 'fixed', choices: [{ foods: [{ customFoodName: 'Fruta', quantity: 1, unit: 'unit' }] }] }] }] }],
  },
};

describe('Lixeira (e2e)', () => {
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

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

  async function trash(token: string) {
    return (await request(server()).get('/trash').set(as(token)).expect(200)).body.items as Array<Record<string, unknown>>;
  }

  it('relatório: excluir esconde do painel e do app; restaurar volta liberado; apagar de vez remove', async () => {
    const me = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, me.accessToken, { fullName: 'Paciente Lixeira' });
    const evaluation = (await request(server()).post(`/clients/${client.id}/evaluations`).set(as(me.accessToken)).send({ heightCm: 170, weightKg: 70 }).expect(201)).body;
    await request(server()).patch(`/clients/${client.id}/evaluations/${evaluation.id}/release`).set(as(me.accessToken)).send({ released: true }).expect(200);
    const report = (await request(server()).post(`/clients/${client.id}/evaluations/${evaluation.id}/reports`).set(as(me.accessToken)).send({ audience: 'client' }).expect(201)).body;
    await request(server()).patch(`/clients/${client.id}/reports/${report.id}/release`).set(as(me.accessToken)).send({ released: true }).expect(200);

    const patient = await login(app, client.user.email, temporaryPassword);
    const clientReports = async () => (await request(server()).get('/client/reports').set(as(patient.accessToken)).expect(200)).body.items;
    expect(await clientReports()).toHaveLength(1);

    await request(server()).delete(`/clients/${client.id}/reports/${report.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).get(`/clients/${client.id}/reports/${report.id}`).set(as(me.accessToken)).expect(404);
    expect((await request(server()).get(`/clients/${client.id}/reports`).set(as(me.accessToken)).expect(200)).body.items).toEqual([]);
    expect(await clientReports()).toEqual([]);
    await request(server()).get(`/client/reports/${report.id}/download-url`).set(as(patient.accessToken)).expect(404);

    expect(await trash(me.accessToken)).toEqual([
      expect.objectContaining({ kind: 'report', id: report.id, clientId: client.id, clientName: 'Paciente Lixeira', audience: 'client', canPurge: true }),
    ]);

    await request(server()).post(`/trash/report/${report.id}/restore`).set(as(me.accessToken)).expect(204);
    expect(await trash(me.accessToken)).toEqual([]);
    expect(await clientReports()).toHaveLength(1);

    await request(server()).delete(`/clients/${client.id}/reports/${report.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).delete(`/trash/report/${report.id}`).set(as(me.accessToken)).expect(204);
    expect(await trash(me.accessToken)).toEqual([]);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toBeNull();
  }, 60_000);

  it('formulário preenchido e formulário: restaurar, e o formulário com respostas não é apagado de vez', async () => {
    const me = await registerProfessional(app);
    const { client } = await createClient(app, me.accessToken);
    const form = (await request(server()).post('/forms').set(as(me.accessToken)).send(FORM).expect(201)).body;
    const response = (await request(server()).post(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).send({ formId: form.id, answers: { fome: 5 } }).expect(201)).body;

    await request(server()).delete(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).delete(`/forms/${form.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).get(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(404);

    const items = await trash(me.accessToken);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'form_response', id: response.id, title: 'Check-in da lixeira', clientId: client.id }),
        expect.objectContaining({ kind: 'form', id: form.id, canPurge: false }),
      ]),
    );

    // Com resposta (mesmo na lixeira) o formulário fica guardado.
    const blocked = await request(server()).delete(`/trash/form/${form.id}`).set(as(me.accessToken)).expect(400);
    expect(blocked.body.message).toContain('respostas de pacientes');

    await request(server()).post(`/trash/form_response/${response.id}/restore`).set(as(me.accessToken)).expect(204);
    expect((await request(server()).get(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).expect(200)).body).toHaveLength(1);

    await request(server()).delete(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).delete(`/trash/form_response/${response.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).delete(`/trash/form/${form.id}`).set(as(me.accessToken)).expect(204);
    expect(await trash(me.accessToken)).toEqual([]);
  });

  it('modelo: vai para a lixeira, restaura e apaga de vez', async () => {
    const me = await registerProfessional(app);
    const tpl = (await request(server()).post('/templates/diets').set(as(me.accessToken)).send(DIET_TEMPLATE).expect(201)).body;
    await request(server()).delete(`/trash/diet_template/${tpl.id}`).set(as(me.accessToken)).expect(400);

    await request(server()).delete(`/templates/diets/${tpl.id}`).set(as(me.accessToken)).expect(204);
    expect(await trash(me.accessToken)).toEqual([expect.objectContaining({ kind: 'diet_template', id: tpl.id, title: 'Modelo da lixeira', clientId: null })]);

    await request(server()).post(`/trash/diet_template/${tpl.id}/restore`).set(as(me.accessToken)).expect(204);
    expect((await request(server()).get('/templates/diets').set(as(me.accessToken)).expect(200)).body).toHaveLength(1);

    await request(server()).delete(`/templates/diets/${tpl.id}`).set(as(me.accessToken)).expect(204);
    await request(server()).delete(`/trash/diet_template/${tpl.id}`).set(as(me.accessToken)).expect(204);
    expect(await prisma.template.findUnique({ where: { id: tpl.id } })).toBeNull();
  });

  it('dieta e treino: restauram só se o paciente estiver sem outro ativo, e nunca são apagados de vez', async () => {
    const me = await registerProfessional(app);
    const { client } = await createClient(app, me.accessToken);

    const dietA = await createDiet(app, me.accessToken, client.id);
    await request(server()).patch(`/clients/${client.id}/diets/${dietA.id}`).set(as(me.accessToken)).send({ status: 'archived' }).expect(200);
    const workout = await createWorkout(app, me.accessToken, client.id);
    await request(server()).patch(`/clients/${client.id}/workouts/${workout.id}`).set(as(me.accessToken)).send({ status: 'archived' }).expect(200);

    expect(await trash(me.accessToken)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'diet', id: dietA.id, title: 'Dieta', canPurge: false }),
        expect.objectContaining({ kind: 'workout', id: workout.id, canPurge: false }),
      ]),
    );
    await request(server()).delete(`/trash/diet/${dietA.id}`).set(as(me.accessToken)).expect(400);

    // Paciente ganhou outra dieta: restaurar a antiga criaria duas ativas.
    const dietB = await createDiet(app, me.accessToken, client.id);
    const conflict = await request(server()).post(`/trash/diet/${dietA.id}/restore`).set(as(me.accessToken)).expect(409);
    expect(conflict.body.message).toContain('já tem uma dieta');

    await request(server()).patch(`/clients/${client.id}/diets/${dietB.id}`).set(as(me.accessToken)).send({ status: 'archived' }).expect(200);
    await request(server()).post(`/trash/diet/${dietA.id}/restore`).set(as(me.accessToken)).expect(204);
    await request(server()).post(`/trash/workout/${workout.id}/restore`).set(as(me.accessToken)).expect(204);

    const diets = (await request(server()).get(`/clients/${client.id}/diets`).set(as(me.accessToken)).expect(200)).body.items;
    expect(diets.find((d: { id: string }) => d.id === dietA.id).status).toBe('active');
    expect((await trash(me.accessToken)).map((i) => i.id)).toEqual([dietB.id]);
  });

  it('isolada por profissional', async () => {
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const { client } = await createClient(app, me.accessToken);
    const form = (await request(server()).post('/forms').set(as(me.accessToken)).send(FORM).expect(201)).body;
    const response = (await request(server()).post(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).send({ formId: form.id, answers: { fome: 3 } }).expect(201)).body;
    await request(server()).delete(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(204);

    expect(await trash(other.accessToken)).toEqual([]);
    await request(server()).post(`/trash/form_response/${response.id}/restore`).set(as(other.accessToken)).expect(404);
    await request(server()).delete(`/trash/form_response/${response.id}`).set(as(other.accessToken)).expect(404);
    await request(server()).post(`/trash/coisa/${response.id}/restore`).set(as(me.accessToken)).expect(400);
    expect(await trash(me.accessToken)).toHaveLength(1);
  });
});
