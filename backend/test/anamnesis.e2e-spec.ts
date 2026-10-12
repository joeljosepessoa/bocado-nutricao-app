import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Anamnese: ficha do paciente em 12 etapas, preenchida pelo profissional no painel.
describe('Anamnese (e2e)', () => {
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

  async function setup() {
    const professional = await registerProfessional(app);
    const created = await createClient(app, professional.accessToken, { fullName: 'Paciente da Ficha', phone: '41999990000' });
    return { professional, ...created, auth: { Authorization: `Bearer ${professional.accessToken}` }, url: `/clients/${created.client.id}/anamnesis` };
  }

  it('ficha ainda não preenchida: vem em branco, com os dados do cadastro na etapa "Dados pessoais"', async () => {
    const { client, auth, url } = await setup();
    const res = await http().get(url).set(auth).expect(200);

    expect(res.body.client).toEqual({ id: client.id, fullName: 'Paciente da Ficha', email: client.user.email, birthDate: null, gender: null, phone: '41999990000' });
    expect(res.body.anamnesis).toMatchObject({ goals: [], conditions: [], familyHistory: [], medications: [], supplements: [], hormones: [], cpf: null, notes: null, completedAt: null, updatedAt: null });
    // Abrir a ficha não cria nada no banco — só registra o acesso.
    expect(await prisma.anamnesis.count({ where: { clientId: client.id } })).toBe(0);
    expect(await prisma.anamnesisAuditLog.count({ where: { clientId: client.id, action: 'read' } })).toBe(1);
  });

  it('salva as 12 etapas e devolve exatamente o que foi preenchido; nascimento, sexo e WhatsApp vão para o cadastro', async () => {
    const { client, auth, url } = await setup();
    const filled = {
      // 1. Dados pessoais
      birthDate: '1987-03-15',
      gender: 'masculino',
      phone: '41997163931',
      maritalStatus: 'Casado',
      cpf: '123.456.789-09',
      rg: '12.345.678-9',
      occupation: 'Motorista',
      address: 'Rua das Flores, 100 — Curitiba/PR',
      // 2. Objetivo
      goals: ['weight_loss', 'health'],
      goalDescription: 'Perder 8 kg até dezembro.',
      // 3. Histórico clínico
      conditions: ['hypertension', 'reflux'],
      otherConditions: 'Enxaqueca',
      // 4–6. Em uso
      medications: [{ name: 'Losartana', dosage: '50 mg', frequency: '1x ao dia' }],
      supplements: [{ name: 'Creatina', dosage: '3 g', frequency: 'diário' }, { name: 'Whey' }],
      hormones: [],
      // 7. Cirurgias e alergias
      surgeries: 'Apendicectomia (2015)',
      allergies: 'Dipirona',
      // 8. Histórico familiar
      familyHistory: ['diabetes', 'heart_attack'],
      // 9. Hábitos
      smoking: 'Não fumante',
      alcohol: 'Social',
      waterIntake: '2 litros/dia',
      sleepHours: '7h',
      sleepQuality: 'regular',
      stressLevel: 'high',
      bowelFrequency: '1x ao dia',
      // 10. Atividade física
      trainingFrequency: '4x por semana',
      trainingDuration: '60 min',
      trainingModality: 'Musculação',
      cardio: '30 min corrida 3x/sem',
      dailySteps: '8000',
      // 11. Alimentação
      mealsPerDay: '5',
      mealTimes: '7h, 10h, 13h, 16h, 20h',
      foodPreferences: 'Comida caseira',
      intolerances: 'Lactose',
      restrictions: 'Nenhuma',
      aversions: 'Fígado',
      // 12. Observações
      notes: 'Trabalha em turnos.',
    };

    const saved = await http().put(url).set(auth).send(filled).expect(200);
    const { birthDate, gender, phone, ...sheet } = filled;
    expect(saved.body.anamnesis).toMatchObject({
      ...sheet,
      supplements: [
        { name: 'Creatina', dosage: '3 g', frequency: 'diário' },
        { name: 'Whey', dosage: null, frequency: null },
      ],
      completedAt: null,
    });
    expect(saved.body.client).toMatchObject({ birthDate, gender, phone });

    // Lida de novo, é a mesma ficha — e o cadastro do paciente recebeu os três campos.
    const again = await http().get(url).set(auth).expect(200);
    expect(again.body.anamnesis).toEqual(saved.body.anamnesis);
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(stored).toMatchObject({ gender: 'masculino', phone: '41997163931' });
    expect(stored.birthDate?.toISOString().slice(0, 10)).toBe('1987-03-15');
  });

  it('salvar por etapa não apaga o resto; campo em branco apaga só ele; "Concluir" marca a data e reabrir limpa', async () => {
    const { client, auth, url } = await setup();
    await http().put(url).set(auth).send({ goals: ['hypertrophy'], goalDescription: 'Ganhar massa', cpf: '111.222.333-44' }).expect(200);
    const second = await http().put(url).set(auth).send({ smoking: 'Não fumante', goalDescription: '   ' }).expect(200);
    expect(second.body.anamnesis).toMatchObject({ goals: ['hypertrophy'], goalDescription: null, cpf: '111.222.333-44', smoking: 'Não fumante', completedAt: null });

    const done = await http().put(url).set(auth).send({ notes: 'Fim', completed: true }).expect(200);
    expect(done.body.anamnesis.completedAt).not.toBeNull();
    // Editar depois de concluída mantém a data da conclusão.
    const edited = await http().put(url).set(auth).send({ notes: 'Fim (revisado)', completed: true }).expect(200);
    expect(edited.body.anamnesis.completedAt).toBe(done.body.anamnesis.completedAt);
    const reopened = await http().put(url).set(auth).send({ completed: false }).expect(200);
    expect(reopened.body.anamnesis).toMatchObject({ completedAt: null, notes: 'Fim (revisado)' });

    expect(await prisma.anamnesis.count({ where: { clientId: client.id } })).toBe(1);
    const actions = (await prisma.anamnesisAuditLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } })).map((log) => log.action);
    expect(actions).toEqual(['saved', 'saved', 'completed', 'completed', 'saved']);
  });

  it('a lista de situação traz só os pacientes do próprio profissional, sem conteúdo da ficha', async () => {
    const { client, auth, url } = await setup();
    const other = await setup();
    await http().put(url).set(auth).send({ cpf: '999.888.777-66', completed: true }).expect(200);
    await http().put(other.url).set(other.auth).send({ notes: 'de outro profissional' }).expect(200);

    const list = await http().get('/anamneses').set(auth).expect(200);
    expect(list.body).toEqual([{ clientId: client.id, completedAt: expect.any(String), updatedAt: expect.any(String) }]);
    expect(JSON.stringify(list.body)).not.toMatch(/999\.888/);
  });

  it('valida o que entra: opção fora da lista, item sem nome, texto longo demais e campo desconhecido são recusados', async () => {
    const { client, auth, url } = await setup();
    await http().put(url).set(auth).send({ goals: ['ficar_rico'] }).expect(400);
    await http().put(url).set(auth).send({ conditions: ['hypertension', 'hypertension'] }).expect(400);
    await http().put(url).set(auth).send({ sleepQuality: 'excelente' }).expect(400);
    await http().put(url).set(auth).send({ gender: 'm' }).expect(400);
    await http().put(url).set(auth).send({ birthDate: '15/03/1987' }).expect(400);
    await http().put(url).set(auth).send({ medications: [{ name: '  ', dosage: '50 mg' }] }).expect(400);
    await http().put(url).set(auth).send({ notes: 'x'.repeat(2001) }).expect(400);
    // Nome e e-mail são do cadastro: não entram pela ficha.
    await http().put(url).set(auth).send({ fullName: 'Outro Nome' }).expect(400);
    await http().put(url).set(auth).send({ email: 'outro@example.com' }).expect(400);
    expect(await prisma.anamnesis.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('só o profissional dono do paciente acessa: outro profissional recebe 404, o paciente 403 e sem login 401', async () => {
    const { client, temporaryPassword, auth, url } = await setup();
    await http().put(url).set(auth).send({ cpf: '123.123.123-12' }).expect(200);
    const intruder = await registerProfessional(app);
    const intruderAuth = { Authorization: `Bearer ${intruder.accessToken}` };

    await http().get(url).set(intruderAuth).expect(404);
    await http().put(url).set(intruderAuth).send({ notes: 'invasão' }).expect(404);
    const clientSession = await login(app, client.user.email, temporaryPassword);
    await http().get(url).set('Authorization', `Bearer ${clientSession.accessToken}`).expect(403);
    await http().get('/anamneses').set('Authorization', `Bearer ${clientSession.accessToken}`).expect(403);
    await http().get(url).expect(401);

    const stored = await prisma.anamnesis.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(stored).toMatchObject({ cpf: '123.123.123-12', notes: null });
  });

  it('LGPD: a ficha entra na exportação de dados do paciente e é apagada quando ele exclui a conta', async () => {
    const { client, temporaryPassword, auth, url } = await setup();
    await http().put(url).set(auth).send({ cpf: '321.654.987-00', conditions: ['diabetes'], allergies: 'Amendoim', completed: true }).expect(200);
    const session = await login(app, client.user.email, temporaryPassword);
    const clientAuth = { Authorization: `Bearer ${session.accessToken}` };

    const exported = await http().post('/client/data-export').set(clientAuth).expect(201);
    expect(exported.body.anamnesis).toMatchObject({ cpf: '321.654.987-00', conditions: ['diabetes'], allergies: 'Amendoim', completedAt: expect.any(String) });

    await http().post('/client/account-deletion').set(clientAuth).send({ currentPassword: temporaryPassword }).expect(204);
    expect(await prisma.anamnesis.count({ where: { clientId: client.id } })).toBe(0);
    // O registro de quem acessou a ficha continua existindo.
    expect(await prisma.anamnesisAuditLog.count({ where: { clientId: client.id } })).toBeGreaterThan(0);
  });
});
