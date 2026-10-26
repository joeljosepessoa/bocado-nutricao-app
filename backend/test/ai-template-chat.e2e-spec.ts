import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { createClient, createExercise, createFood, login, registerProfessional } from './helpers';

jest.setTimeout(30_000);
const prisma = new PrismaClient();

/** Provedor roteirizado no lugar do mock local (mesmo id): consentimento, conferência e logs são os reais. */
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};
const reply = (body: unknown) => fakeProvider.generate.mockResolvedValueOnce({ text: JSON.stringify(body), model: 'fake-model' });
const foodRef = (id: string) => `P${id.replace(/-/g, '').slice(0, 8)}`;
const exRef = (id: string) => `E${id.replace(/-/g, '').slice(0, 8)}`;
const sentContext = (call = 0) => fakeProvider.generate.mock.calls[call][0].context as Record<string, any>;

const fixedMeal = (name: string, items: unknown[]) => ({ name, time: null, notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items }] }] });

describe('IA — conversa nos Modelos (template_diet_chat / template_workout_chat, e2e)', () => {
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

  async function setup({ consent = true } = {}) {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    if (consent) await http().post('/professionals/me/ai/consent').set(auth).expect(201);
    const tag = Date.now().toString(36);
    const frango = await createFood(app, professional.accessToken, { name: `Frango chat ${tag}`, scope: 'private', kcalPer100: 160, proteinGPer100: 32, carbGPer100: 0, fatGPer100: 2.5 });
    const arroz = await createFood(app, professional.accessToken, { name: `Arroz chat ${tag}`, scope: 'private', kcalPer100: 128, proteinGPer100: 2.5, carbGPer100: 28, fatGPer100: 0.2 });
    return { professional, auth, frango, arroz };
  }

  const ask = (text: string, extra: Record<string, unknown> = {}) => ({ messages: [{ role: 'professional', text }], ...extra });

  it('sem o consentimento de IA do profissional: bloqueia antes de chamar a IA', async () => {
    const { auth } = await setup({ consent: false });
    const res = await http().post('/templates/ai/diet').set(auth).send(ask('Monte uma dieta de 1800 kcal')).expect(403);
    expect(res.body.message).toMatch(/ativou as ferramentas de IA/);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('dieta do zero: só alimentos do catálogo, calorias pelo sistema; registro sem paciente', async () => {
    const { professional, auth, frango, arroz } = await setup();
    reply({
      reply: 'Montei um almoço simples.',
      changed: true,
      days: [{ label: null, kind: 'other', usageNotes: null, meals: [fixedMeal('Almoço', [{ ref: foodRef(arroz.id), quantity: 150, notes: null }, { ref: foodRef(frango.id), quantity: 100, notes: null }, { ref: 'T99999', quantity: 50, notes: null }])] }],
      guidelines: ['Beba água ao longo do dia.'],
      warnings: [],
    });
    const res = await http().post('/templates/ai/diet').set(auth).send(ask('Monte um almoço com arroz e frango')).expect(201);
    const data = res.body.structuredData;

    expect(data.reply).toBe('Montei um almoço simples.');
    expect(data.changed).toBe(true);
    const foods = data.content.days[0].meals[0].groups[0].choices[0].foods;
    expect(foods).toEqual([
      { foodId: arroz.id, customFoodName: arroz.name, quantity: 150, unit: 'g', notes: null },
      { foodId: frango.id, customFoodName: frango.name, quantity: 100, unit: 'g', notes: null },
    ]);
    expect(data.warnings.join(' ')).toMatch(/não está no catálogo \("T99999"\)/);
    expect(data.content.patientGuidelines).toBe('Beba água ao longo do dia.');
    // 150 g de arroz (192 kcal) + 100 g de frango (160 kcal)
    expect(data.nutrition[0].min.kcal).toBe(352);
    expect(data.foods).toEqual(expect.arrayContaining([{ id: arroz.id, name: arroz.name }, { id: frango.id, name: frango.name }]));

    expect(sentContext()).toMatchObject({ pedido: 'Monte um almoço com arroz e frango', conversa: [], modeloAtual: null });
    expect(Object.keys(sentContext())).toEqual(['pedido', 'conversa', 'modeloAtual', 'catalogo']);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { professionalId: professional.user.id, feature: 'template_diet_chat' } });
    expect(log).toMatchObject({ clientId: null, status: 'succeeded', processingPolicy: 'professional_material' });
  });

  it('ajuste de um modelo: mantém item escrito à mão (X…) e o nome que o profissional deu; "só respondeu" não muda nada', async () => {
    const { auth, frango, arroz } = await setup();
    const current = {
      objective: 'Emagrecimento',
      days: [
        {
          label: null,
          kind: 'other',
          meals: [
            {
              name: 'Almoço',
              time: '12:00',
              groups: [{ kind: 'fixed', choices: [{ foods: [{ foodId: arroz.id, customFoodName: 'Arroz branco', quantity: 100, unit: 'g' }, { customFoodName: 'Salada verde', isFreeQuantity: true }] }] }],
            },
          ],
        },
      ],
      supplements: [{ name: 'Creatina', quantity: 3, unitText: 'g' }],
      patientGuidelines: 'Mastigar devagar.',
    };
    reply({
      reply: 'Aumentei o arroz e troquei a proteína.',
      changed: true,
      days: [
        {
          label: null,
          kind: 'other',
          usageNotes: null,
          meals: [{ ...fixedMeal('Almoço', [{ ref: foodRef(arroz.id), quantity: 120, notes: null }, { ref: 'X1', quantity: null, notes: null }, { ref: foodRef(frango.id), quantity: 100, notes: null }]), time: '12:00' }],
        },
      ],
      guidelines: [],
      warnings: [],
    });
    const res = await http().post('/templates/ai/diet').set(auth).send({ messages: [{ role: 'professional', text: 'Monte um almoço' }, { role: 'assistant', text: 'Pronto.' }, { role: 'professional', text: 'Aumente o arroz e coloque frango' }], current }).expect(201);
    const data = res.body.structuredData;
    const foods = data.content.days[0].meals[0].groups[0].choices[0].foods;
    expect(foods[0]).toMatchObject({ foodId: arroz.id, customFoodName: 'Arroz branco', quantity: 120, unit: 'g' });
    expect(foods[1]).toEqual({ customFoodName: 'Salada verde', isFreeQuantity: true, notes: null });
    expect(foods[2]).toMatchObject({ foodId: frango.id, quantity: 100 });
    expect(data.content).toMatchObject({ objective: 'Emagrecimento', supplements: [{ name: 'Creatina' }], patientGuidelines: 'Mastigar devagar.' });
    expect(data.nutrition[0].partial).toBe(true); // salada "à vontade" fica sem cálculo

    const sent = sentContext();
    expect(sent.conversa).toEqual([
      { quem: 'nutricionista', texto: 'Monte um almoço' },
      { quem: 'assistente', texto: 'Pronto.' },
    ]);
    expect(sent.modeloAtual.days[0].meals[0].groups[0].choices[0].items).toEqual([
      { ref: foodRef(arroz.id), nome: 'Arroz branco', quantity: 100, notes: null },
      { ref: 'X1', nome: 'Salada verde', quantity: null, ate: null, unidade: 'à vontade', notes: null },
    ]);

    reply({ reply: 'Quantas refeições por dia?', changed: false, days: [], guidelines: [], warnings: [] });
    const question = await http().post('/templates/ai/diet').set(auth).send(ask('Quero mudar', { current })).expect(201);
    expect(question.body.structuredData).toMatchObject({ reply: 'Quantas refeições por dia?', changed: false });
    expect(question.body.structuredData.content.days[0].meals[0].name).toBe('Almoço');
  });

  it('treino do zero: só exercícios do catálogo; repetições exatas+faixa juntas são corrigidas com aviso', async () => {
    const { professional, auth } = await setup();
    const marca = `Zqchat${Date.now().toString(36)}`;
    const squat = await createExercise(app, professional.accessToken, { name: `Agachamento ${marca}` });
    // Só exercício com GIF aprovado vai para a IA (todo exercício sugerido tem demonstração).
    await prisma.exerciseMedia.create({
      data: { exerciseId: squat.id, storageKey: `exercises/TESTE/${squat.id}.gif`, contentType: 'image/gif', sizeBytes: 1, curationStatus: 'approved', isPrimary: true },
    });
    const noGif = await createExercise(app, professional.accessToken, { name: `Agachamento sem gif ${Date.now()}` });
    const set = { reps: null, repsMin: 8, repsMax: 12, loadValue: null, loadUnit: null, restSeconds: 60, durationSeconds: null, tempo: null, notes: null };
    reply({
      reply: 'Treino A pronto.',
      changed: true,
      days: [{ name: 'Treino A', notes: null, exercises: [{ ref: exRef(squat.id), notes: null, sets: [set, { ...set, reps: 10 }] }, { ref: 'Einventado', notes: null, sets: [set] }] }],
      warnings: [],
    });
    const res = await http().post('/templates/ai/workout').set(auth).send(ask(`Treino de pernas para iniciante com agachamento ${marca}`)).expect(201);
    const data = res.body.structuredData;
    expect(data.content.days[0].exercises).toHaveLength(1);
    expect(data.content.days[0].exercises[0]).toMatchObject({ exerciseId: squat.id, sets: [{ repsMin: 8, repsMax: 12, reps: null }, { repsMin: 8, repsMax: 12, reps: null }] });
    expect(data.warnings.join(' ')).toMatch(/repetições ajustadas/);
    expect(data.warnings.join(' ')).toMatch(/não está no catálogo \("Einventado"\)/);
    expect(data.exercises).toEqual([expect.objectContaining({ id: squat.id, name: squat.name })]);

    // O que foi salvo como modelo a partir disso passa na validação dos Modelos.
    await http().post('/templates/workouts').set(auth).send({ name: 'Pernas', content: data.content }).expect(201);
    expect(sentContext().catalogo.some((e: { ref: string }) => e.ref === exRef(squat.id))).toBe(true);
    expect(sentContext().catalogo.some((e: { ref: string }) => e.ref === exRef(noGif.id))).toBe(false);
  });

  it('regras de entrada: última fala tem de ser do profissional; rota do paciente não aceita esses recursos; paciente não usa', async () => {
    const { professional, auth } = await setup();
    await http().post('/templates/ai/diet').set(auth).send({ messages: [{ role: 'assistant', text: 'Oi' }] }).expect(400);
    await http().post('/templates/ai/diet').set(auth).send({ messages: [] }).expect(400);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    await http().post(`/clients/${client.id}/ai/generate`).set(auth).send({ feature: 'template_diet_chat' }).expect(400);
    const session = await login(app, client.user.email, temporaryPassword);
    await http().post('/templates/ai/diet').set('Authorization', `Bearer ${session.accessToken}`).send(ask('x')).expect(403);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });
});
