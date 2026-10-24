import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { CLIENT_AI_CONSENT_MISSING_MESSAGE } from '../src/ai/ai.service';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { createClient, createExercise, createFood, login, registerProfessional } from './helpers';

jest.setTimeout(30_000);
const prisma = new PrismaClient();

const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};
const reply = (body: unknown) => fakeProvider.generate.mockResolvedValueOnce({ text: JSON.stringify(body), model: 'fake-model' });
const foodRef = (id: string) => `P${id.replace(/-/g, '').slice(0, 8)}`;
const exRef = (id: string) => `E${id.replace(/-/g, '').slice(0, 8)}`;
const sent = (call = 0) => fakeProvider.generate.mock.calls[call][0] as AiGenerationRequest & { context: Record<string, any> };

// Conversa com a IA DENTRO do paciente: dados mínimos dele (idade, sexo, avaliação e parte da anamnese), só com o consentimento dele.
describe('IA — conversa dentro do paciente (patient_diet_chat / patient_workout_chat, e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MockAiProvider).useValue(fakeProvider).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => fakeProvider.generate.mockReset());

  async function setup({ patientConsent = true } = {}) {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    await http().post('/professionals/me/ai/consent').set(auth).expect(201);
    const fullName = `Paciente Sigilosa ${Date.now()}`;
    const { client, temporaryPassword } = await createClient(app, professional.accessToken, { fullName, gender: 'female', birthDate: '1990-06-15', phone: '41999998888' });
    const session = await login(app, client.user.email, temporaryPassword);
    if (patientConsent) await http().post('/client/ai/consent').set('Authorization', `Bearer ${session.accessToken}`).expect(201);
    await http()
      .put(`/clients/${client.id}/anamnesis`)
      .set(auth)
      .send({
        cpf: '123.456.789-09',
        rg: '12.345.678-9',
        address: 'Rua Secreta, 42',
        occupation: 'Professora',
        maritalStatus: 'Casada',
        goals: ['weight_loss'],
        goalDescription: 'Perder 6 kg até o verão.',
        conditions: ['hypertension'],
        medications: [{ name: 'Losartana', dosage: '50 mg' }],
        allergies: 'Amendoim',
        intolerances: 'Lactose',
        aversions: 'Fígado',
        mealsPerDay: '5',
        trainingFrequency: '3x por semana',
        notes: 'Prefere refeições rápidas no trabalho',
      })
      .expect(200);
    await http().post(`/clients/${client.id}/evaluations`).set(auth).send({ heightCm: 165, weightKg: 72, evaluatedAt: '2026-10-01T12:00:00.000Z' }).expect(201);
    const tag = Date.now().toString(36);
    const frango = await createFood(app, professional.accessToken, { name: `Frango pac ${tag}`, scope: 'private', kcalPer100: 160, proteinGPer100: 32, carbGPer100: 0, fatGPer100: 2.5 });
    return { professional, auth, client, fullName, frango };
  }

  const ask = (text: string, extra: Record<string, unknown> = {}) => ({ messages: [{ role: 'professional', text }], ...extra });
  const dietReply = (foodId: string) =>
    reply({
      reply: 'Montei um almoço sem lactose e sem amendoim.',
      changed: true,
      days: [{ label: null, kind: 'other', usageNotes: null, meals: [{ name: 'Almoço', time: '12:00', notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items: [{ ref: foodRef(foodId), quantity: 120, notes: null }] }] }] }] }],
      guidelines: [],
      warnings: ['Hipertensão: confira o sódio.'],
    });

  it('sem o consentimento do paciente: bloqueia antes de chamar a IA e não lê a anamnese', async () => {
    const { auth, client } = await setup({ patientConsent: false });
    const readsBefore = await prisma.anamnesisAuditLog.count({ where: { clientId: client.id, action: 'read' } });
    const res = await http().post(`/clients/${client.id}/ai/diet-chat`).set(auth).send(ask('Monte a dieta')).expect(403);
    expect(res.body.message).toBe(CLIENT_AI_CONSENT_MISSING_MESSAGE);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
    expect(await prisma.anamnesisAuditLog.count({ where: { clientId: client.id, action: 'read' } })).toBe(readsBefore);
    expect(await prisma.aiAuditLog.count({ where: { clientId: client.id, feature: 'patient_diet_chat', action: 'generation_blocked' } })).toBe(1);
  });

  it('com consentimento: a IA recebe a anamnese inteira menos o que identifica a pessoa; a dieta volta conferida', async () => {
    const { auth, client, fullName, frango } = await setup();
    dietReply(frango.id);
    const res = await http().post(`/clients/${client.id}/ai/diet-chat`).set(auth).send(ask('Monte uma dieta para ela')).expect(201);
    expect(res.body.structuredData.content.days[0].meals[0].groups[0].choices[0].foods[0]).toMatchObject({ foodId: frango.id, quantity: 120 });
    expect(res.body.structuredData.warnings).toEqual(['Hipertensão: confira o sódio.']);

    const { context, systemPrompt } = sent();
    expect(systemPrompt).toMatch(/UM paciente/);
    expect(context.paciente).toMatchObject({
      idadeAnos: expect.any(Number),
      sexo: 'feminino',
      ultimaAvaliacao: { data: '2026-10-01', pesoKg: 72, alturaCm: 165 },
      anamnese: {
        objetivos: ['weight_loss'],
        objetivoDescricao: 'Perder 6 kg até o verão.',
        doencas: ['hypertension'],
        medicamentos: [{ nome: 'Losartana', dose: '50 mg' }],
        alergias: 'Amendoim',
        alimentacao: { intolerancias: 'Lactose', aversoes: 'Fígado', refeicoesPorDia: '5' },
        atividadeFisica: { frequencia: '3x por semana' },
        // A ficha vai inteira, menos o que só identifica a pessoa.
        profissao: 'Professora',
        estadoCivil: 'Casada',
        observacoes: 'Prefere refeições rápidas no trabalho',
      },
    });
    const everything = JSON.stringify(context);
    for (const secret of [fullName, client.user.email, '41999998888', '123.456.789-09', '12.345.678-9', 'Rua Secreta']) {
      expect(everything).not.toContain(secret);
    }

    // A leitura da ficha pela IA entra no registro de acesso; a interação fica ligada ao paciente.
    expect(await prisma.anamnesisAuditLog.count({ where: { clientId: client.id, action: 'read' } })).toBeGreaterThan(0);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'patient_diet_chat' } });
    expect(log).toMatchObject({ status: 'succeeded', processingPolicy: 'client_consent' });
  });

  it('ponto de partida: a dieta atual do paciente no formato do editor, e se ele autorizou a IA', async () => {
    const { auth, client, frango } = await setup();
    const empty = await http().get(`/clients/${client.id}/diet-content`).set(auth).expect(200);
    expect(empty.body).toEqual({ content: null, foods: [], patientAiConsent: true });

    const content = { days: [{ label: null, meals: [{ name: 'Almoço', groups: [{ kind: 'fixed', choices: [{ foods: [{ foodId: frango.id, customFoodName: 'Frango grelhado', quantity: 100, unit: 'g' }] }] }] }] }] };
    const tpl = await http().post('/templates/diets').set(auth).send({ name: 'Base', content }).expect(201);
    await http().post(`/templates/diets/${tpl.body.id}/apply`).set(auth).send({ clientId: client.id }).expect(201);

    const current = await http().get(`/clients/${client.id}/diet-content`).set(auth).expect(200);
    expect(current.body.content.days[0].meals[0].groups[0].choices[0].foods[0]).toMatchObject({ foodId: frango.id, customFoodName: 'Frango grelhado', quantity: 100 });
    expect(current.body.foods).toEqual([{ id: frango.id, name: frango.name }]);
    expect((await http().get(`/clients/${client.id}/workout-content`).set(auth).expect(200)).body).toEqual({ content: null, exercises: [], patientAiConsent: true });

    const intruder = await registerProfessional(app);
    await http().get(`/clients/${client.id}/diet-content`).set('Authorization', `Bearer ${intruder.accessToken}`).expect(404);
  });

  it('treino do paciente: contexto com a anamnese; outro profissional não usa a conversa com o paciente alheio', async () => {
    const { professional, auth, client } = await setup();
    const squat = await createExercise(app, professional.accessToken, { name: `Agachamento pac ${Date.now()}` });
    reply({
      reply: 'Treino A sem impacto.',
      changed: true,
      days: [{ name: 'Treino A', notes: null, exercises: [{ ref: exRef(squat.id), notes: null, sets: [{ reps: 12, repsMin: null, repsMax: null, loadValue: null, loadUnit: null, restSeconds: 60, durationSeconds: null, tempo: null, notes: null }] }] }],
      warnings: [],
    });
    const res = await http().post(`/clients/${client.id}/ai/workout-chat`).set(auth).send(ask('Treino para ela')).expect(201);
    expect(res.body.structuredData.content.days[0].exercises[0].exerciseId).toBe(squat.id);
    expect(sent().context.paciente.anamnese.doencas).toEqual(['hypertension']);

    const intruder = await registerProfessional(app);
    const intruderAuth = { Authorization: `Bearer ${intruder.accessToken}` };
    await http().post('/professionals/me/ai/consent').set(intruderAuth).expect(201);
    await http().post(`/clients/${client.id}/ai/workout-chat`).set(intruderAuth).send(ask('x')).expect(404);
    await http().post(`/clients/${client.id}/ai/generate`).set(auth).send({ feature: 'patient_diet_chat' }).expect(400);
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
  });
});
