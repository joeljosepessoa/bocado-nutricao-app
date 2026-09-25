import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { ORGANIZED_WORKOUT_JSON_SCHEMA } from '../src/ai/use-cases/organize-workout/organized-workout.schema';
import { createClient, createExercise, registerProfessional } from './helpers';

const prisma = new PrismaClient();

/**
 * Provedor falso controlado pelo teste, registrado no lugar do mock local
 * (mesmo id) — o pipeline real (autorização, consentimento, validação,
 * matching, logs) roda inteiro; só a resposta do "modelo" é roteirizada.
 */
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};

const reply = (body: unknown, extra: Partial<AiGenerationResult> = {}) =>
  fakeProvider.generate.mockResolvedValueOnce({
    text: typeof body === 'string' ? body : JSON.stringify(body),
    model: 'fake-model',
    ...extra,
  });

const group = (overrides: Record<string, unknown> = {}) => ({
  count: 1,
  reps: null,
  repsMin: null,
  repsMax: null,
  restSeconds: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  tempo: null,
  notes: null,
  ...overrides,
});

describe('IA — organizar treino existente (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockAiProvider)
      .useValue(fakeProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    fakeProvider.generate.mockReset();
    fakeProvider.supportsStructuredOutput = true;
  });

  async function setup({ professionalConsent = true, clientConsent = true } = {}) {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(200);
    const clientToken = login.body.accessToken as string;
    if (professionalConsent) {
      await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${professional.accessToken}`).expect(201);
    }
    if (clientConsent) {
      await request(app.getHttpServer()).post('/client/ai/consent').set('Authorization', `Bearer ${clientToken}`).expect(201);
    }
    return { professional, client, clientToken };
  }

  const organize = (token: string, clientId: string, workoutText = 'SEGUNDA - PEITO\nSupino reto com barra\n4x6-10\nDescanso 90s') =>
    request(app.getHttpServer())
      .post(`/clients/${clientId}/ai/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ feature: 'organize_workout', workoutText });

  it('JSON válido: devolve proposta estruturada, faixa preservada, catálogo casado (com GIF), avisos e nada gravado em treino', async () => {
    const { professional, client } = await setup();
    const unique = `Supino reto teste ${Date.now()}`;
    const catalogExercise = await createExercise(app, professional.accessToken, { name: unique, scope: 'private' });
    // O caminho relativo do GIF só entra pelo importador de mídia (direto no banco) — a API aceita só URL absoluta.
    await prisma.exercise.update({ where: { id: catalogExercise.id }, data: { imageUrl: '/exercise-media/' + 'a'.repeat(64) } });
    const ambiguousName = `Remada ambígua ${Date.now()}`;
    await createExercise(app, professional.accessToken, { name: ambiguousName, scope: 'private', equipment: 'Barra' });
    await createExercise(app, professional.accessToken, { name: ambiguousName, scope: 'private', equipment: 'Halteres' });

    reply({
      days: [
        {
          name: 'SEGUNDA - PEITO + TRÍCEPS',
          notes: null,
          exercises: [
            { name: unique.toUpperCase(), muscleGroup: 'Peito', notes: null, setGroups: [group({ count: 4, repsMin: 6, repsMax: 10, restSeconds: 90 })], warnings: [] },
            { name: ambiguousName, muscleGroup: null, notes: 'drop-set na última', setGroups: [group({ count: 3, reps: 12 })], warnings: [] },
            { name: 'Exercício que não existe xyz', muscleGroup: null, notes: null, setGroups: [group({ reps: 12 }), group({ reps: 10 })], warnings: ['"até a falha" não mapeado'] },
          ],
        },
      ],
      warnings: [],
    });

    const res = await organize(professional.accessToken, client.id).expect(201);

    expect(res.body.isAiGenerated).toBe(true);
    expect(res.body.feature).toBe('organize_workout');
    const [day] = res.body.structuredData.days;
    expect(day.name).toBe('SEGUNDA - PEITO + TRÍCEPS');

    const [matched, ambiguous, notFound] = day.exercises;
    expect(matched.matchStatus).toBe('matched');
    expect(matched.matchedExercise).toMatchObject({ id: catalogExercise.id, name: unique, imageUrl: '/exercise-media/' + 'a'.repeat(64) });
    expect(matched.sets).toHaveLength(4);
    expect(matched.sets.every((s: { reps: number | null; repsMin: number; repsMax: number }) => s.reps === null && s.repsMin === 6 && s.repsMax === 10)).toBe(true);
    expect(matched.warnings).toEqual(['Repetições apresentadas como intervalo.']);

    expect(ambiguous.matchStatus).toBe('ambiguous');
    expect(ambiguous.matchedExercise).toBeNull();
    expect(ambiguous.candidates).toHaveLength(2);
    expect(ambiguous.notes).toBe('drop-set na última');
    expect(ambiguous.warnings).toEqual(expect.arrayContaining(['Nome do exercício possui mais de uma correspondência possível.', 'Descanso não informado.']));

    expect(notFound.matchStatus).toBe('not_found');
    expect(notFound.sets.map((s: { reps: number }) => s.reps)).toEqual([12, 10]);
    expect(notFound.warnings).toEqual(expect.arrayContaining(['Exercício não encontrado no catálogo.', '"até a falha" não mapeado']));

    const workouts = await request(app.getHttpServer()).get(`/clients/${client.id}/workouts`).set('Authorization', `Bearer ${professional.accessToken}`).expect(200);
    expect(workouts.body.items).toHaveLength(0);
  });

  it('só o texto colado vai ao provedor — nenhum dado do cliente no contexto', async () => {
    const { professional, client } = await setup();
    reply({ days: [{ name: null, exercises: [{ name: 'Agachamento', setGroups: [group({ reps: 10 })] }] }], warnings: [] });

    await organize(professional.accessToken, client.id, 'Agachamento 1x10').expect(201);

    const sent = fakeProvider.generate.mock.calls[0][0];
    expect(sent.context).toEqual({ workoutText: 'Agachamento 1x10' });
    expect(sent.responseSchema).toEqual(ORGANIZED_WORKOUT_JSON_SCHEMA);
    expect(sent.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(sent)).not.toContain(client.user.email);
  });

  it('JSON inválido: 503 controlado, interação registrada como invalid_output, nenhum treino criado', async () => {
    const { professional, client } = await setup();
    reply('desculpe, não consegui');

    const res = await organize(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toMatch(/formato inválido/);

    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_workout' } });
    expect(log.status).toBe('invalid_output');
    expect(log.responseText).toBeNull();
    expect(await prisma.workout.count({ where: { clientId: client.id } })).toBe(0);
  });

  it('JSON fora do schema (reps junto com faixa): 503 com o problema apontado', async () => {
    const { professional, client } = await setup();
    reply({ days: [{ exercises: [{ name: 'Supino', setGroups: [group({ reps: 8, repsMin: 6, repsMax: 10 })] }] }] });
    const res = await organize(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toMatch(/nunca os dois/);
  });

  it('treino sem exercícios: 503 "nenhum exercício identificado"', async () => {
    const { professional, client } = await setup();
    reply({ days: [{ name: 'Segunda', exercises: [] }], warnings: ['texto não parece um treino'] });
    const res = await organize(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toBe('Nenhum exercício foi identificado no texto informado.');
  });

  it('resposta truncada pelo limite de saída: 503 pedindo para dividir o treino', async () => {
    const { professional, client } = await setup();
    reply('{"days":[{"name":"Seg', { truncated: true });
    const res = await organize(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toMatch(/longo demais/);
  });

  it('dados ausentes viram avisos, sem valor inventado', async () => {
    const { professional, client } = await setup();
    reply({ days: [{ name: null, exercises: [{ name: 'Prancha xyz', setGroups: [group()] }] }] });

    const res = await organize(professional.accessToken, client.id).expect(201);
    const [day] = res.body.structuredData.days;
    expect(day.name).toBe('Dia 1');
    expect(day.warnings).toContain('Nome do dia não informado.');
    const [exercise] = day.exercises;
    expect(exercise.sets[0]).toMatchObject({ reps: null, repsMin: null, repsMax: null, restSeconds: null, loadValue: null });
    expect(exercise.warnings).toEqual(expect.arrayContaining(['Descanso não informado.', 'Repetições não informadas.']));
  });

  it('provedor sem saída estruturada (mock local real): 503 explicando que falta provedor real', async () => {
    const { professional, client } = await setup();
    fakeProvider.supportsStructuredOutput = false;

    const res = await organize(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toMatch(/AI_PROVIDER=claude/);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_workout' } });
    expect(log.status).toBe('failed');
  });

  it('profissional sem acesso ao cliente: 404, provedor nunca chamado', async () => {
    const { client } = await setup();
    const intruder = await registerProfessional(app);
    await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${intruder.accessToken}`).expect(201);

    await organize(intruder.accessToken, client.id).expect(404);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('sem consentimento do cliente ou do profissional: 403, provedor nunca chamado', async () => {
    const noClient = await setup({ clientConsent: false });
    await organize(noClient.professional.accessToken, noClient.client.id).expect(403);
    const noPro = await setup({ professionalConsent: false });
    await organize(noPro.professional.accessToken, noPro.client.id).expect(403);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('cliente não consegue chamar a organização de treino (fora da allowlist) nem sem login', async () => {
    const { client, clientToken } = await setup();
    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'organize_workout', workoutText: 'Supino 3x10' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ feature: 'organize_workout', workoutText: 'Supino 3x10' })
      .expect(403);
    await request(app.getHttpServer()).post(`/clients/${client.id}/ai/generate`).send({ feature: 'organize_workout', workoutText: 'x' }).expect(401);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('texto vazio ou longo demais: 400 antes de qualquer chamada', async () => {
    const { professional, client } = await setup();
    await organize(professional.accessToken, client.id, '   ').expect(400);
    await organize(professional.accessToken, client.id, 'x'.repeat(12001)).expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('logs: interação e auditoria registradas, sem segredo', async () => {
    const { professional, client } = await setup();
    reply({ days: [{ exercises: [{ name: 'Leg press', setGroups: [group({ count: 3, reps: 12, restSeconds: 60 })] }] }] });
    await organize(professional.accessToken, client.id, 'Leg press 3x12 60s').expect(201);

    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_workout' } });
    expect(log).toMatchObject({
      professionalId: professional.user.id,
      provider: 'mock-local',
      model: 'fake-model',
      promptVersion: 'organize_workout@v1',
      status: 'succeeded',
    });
    expect(log.contextSummary).toEqual({ workoutText: 'Leg press 3x12 60s' });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toMatch(/sk-ant|ANTHROPIC_API_KEY|x-api-key/i);

    const audit = await prisma.aiAuditLog.findMany({ where: { clientId: client.id, feature: 'organize_workout' }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['generation_requested', 'generation_succeeded']);
  });
});
