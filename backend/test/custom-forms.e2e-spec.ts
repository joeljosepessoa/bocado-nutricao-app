import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

const CHECKIN = {
  name: 'Check-in semanal',
  description: 'Na consulta de retorno',
  questions: [
    { id: 'fome', type: 'scale', label: 'Fome durante a semana', required: true },
    { id: 'adesao', type: 'single_choice', label: 'Seguiu a dieta?', options: ['Quase sempre', 'Metade', 'Pouco'], required: true },
    { id: 'obs', type: 'long_text', label: 'Observações', required: false },
  ],
};

describe('Formulários próprios (e2e)', () => {
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

  it('cria formulário, preenche para o paciente e a resposta não muda quando o formulário muda', async () => {
    const me = await registerProfessional(app);
    const { client } = await createClient(app, me.accessToken);
    const server = app.getHttpServer();

    const form = (await request(server).post('/forms').set(as(me.accessToken)).send(CHECKIN).expect(201)).body;
    expect(form).toMatchObject({ name: 'Check-in semanal', deletedAt: null });

    const list = (await request(server).get('/forms').set(as(me.accessToken)).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ id: form.id, questionCount: 3, responseCount: 0 })]);

    // Obrigatória faltando: 400 com o motivo.
    const bad = await request(server).post(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).send({ formId: form.id, answers: { fome: 5 } }).expect(400);
    expect(bad.body.message).toContain('"Seguiu a dieta?" é obrigatória.');

    const response = (
      await request(server)
        .post(`/clients/${client.id}/form-responses`)
        .set(as(me.accessToken))
        .send({ formId: form.id, answers: { fome: 6, adesao: 'Metade' }, filledAt: '2026-10-20T14:00:00.000Z' })
        .expect(201)
    ).body;
    expect(response).toMatchObject({ formName: 'Check-in semanal', answers: { fome: 6, adesao: 'Metade', obs: null } });

    // Muda o formulário: a resposta antiga continua com as perguntas de antes.
    await request(server)
      .patch(`/forms/${form.id}`)
      .set(as(me.accessToken))
      .send({ name: 'Check-in v2', questions: [{ id: 'sono', type: 'number', label: 'Horas de sono', unit: 'h', required: true }] })
      .expect(200);
    const saved = (await request(server).get(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(200)).body;
    expect(saved.formName).toBe('Check-in semanal');
    expect(saved.questions).toHaveLength(3);

    // Corrige a resposta (vale a pergunta gravada nela).
    const fixed = (await request(server).patch(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).send({ answers: { fome: 8, adesao: 'Quase sempre', obs: 'ok' } }).expect(200)).body;
    expect(fixed.answers).toEqual({ fome: 8, adesao: 'Quase sempre', obs: 'ok' });

    const responses = (await request(server).get(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).expect(200)).body;
    expect(responses).toEqual([expect.objectContaining({ id: response.id, formName: 'Check-in semanal', questionCount: 3, answeredCount: 3 })]);
    expect(responses[0]).not.toHaveProperty('answers');

    // Lixeira: some da lista, a resposta continua; não dá para preencher um formulário na lixeira.
    await request(server).delete(`/forms/${form.id}`).set(as(me.accessToken)).expect(204);
    expect((await request(server).get('/forms').set(as(me.accessToken)).expect(200)).body).toEqual([]);
    expect((await request(server).get('/forms?trash=true').set(as(me.accessToken)).expect(200)).body).toHaveLength(1);
    await request(server).post(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).send({ formId: form.id, answers: { sono: 7 } }).expect(404);
    await request(server).get(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(200);

    await request(server).delete(`/clients/${client.id}/form-responses/${response.id}`).set(as(me.accessToken)).expect(204);
    expect((await request(server).get(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).expect(200)).body).toEqual([]);
  });

  it('isolado por profissional e fora do alcance do paciente', async () => {
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, me.accessToken);
    const server = app.getHttpServer();
    const form = (await request(server).post('/forms').set(as(me.accessToken)).send(CHECKIN).expect(201)).body;

    await request(server).get(`/forms/${form.id}`).set(as(other.accessToken)).expect(404);
    await request(server).post(`/clients/${client.id}/form-responses`).set(as(other.accessToken)).send({ formId: form.id, answers: {} }).expect(404);
    expect((await request(server).get('/forms').set(as(other.accessToken)).expect(200)).body).toEqual([]);

    const patient = await login(app, client.user.email, temporaryPassword);
    await request(server).get('/forms').set(as(patient.accessToken)).expect(403);
    await request(server).get(`/clients/${client.id}/form-responses`).set(as(patient.accessToken)).expect(403);
  });

  it('LGPD: vai na exportação do paciente e é apagado com a conta', async () => {
    const me = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, me.accessToken);
    const server = app.getHttpServer();
    const form = (await request(server).post('/forms').set(as(me.accessToken)).send(CHECKIN).expect(201)).body;
    await request(server).post(`/clients/${client.id}/form-responses`).set(as(me.accessToken)).send({ formId: form.id, answers: { fome: 4, adesao: 'Pouco' } }).expect(201);

    const patient = await login(app, client.user.email, temporaryPassword);
    const exported = (await request(server).post('/client/data-export').set(as(patient.accessToken)).expect(201)).body;
    expect(exported.customForms).toEqual([expect.objectContaining({ formName: 'Check-in semanal', answers: { fome: 4, adesao: 'Pouco', obs: null } })]);

    await request(server).post('/client/account-deletion').set(as(patient.accessToken)).send({ currentPassword: temporaryPassword }).expect(204);
    expect(await prisma.customFormResponse.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('pergunta inválida volta com o motivo em português', async () => {
    const me = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .post('/forms')
      .set(as(me.accessToken))
      .send({ name: 'Ruim', questions: [{ id: 'x', type: 'single_choice', label: 'Escolha', options: ['Única'] }] })
      .expect(400);
    expect(res.body.message).toBe('Pergunta 1: coloque pelo menos 2 opções.');
  });
});
