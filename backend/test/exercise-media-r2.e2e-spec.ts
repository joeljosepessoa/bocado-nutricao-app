import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { createClient, createExercise, createWorkout, registerProfessional } from './helpers';

// Nenhuma chamada real ao R2: o presigner é simulado (o S3Client real é só construído, sem rede).
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

const prisma = new PrismaClient();
const ENDPOINT = 'https://conta-teste.r2.cloudflarestorage.com';
const ACCESS_KEY = 'access-key-r2-e2e';
const SECRET = 'segredo-r2-e2e-NUNCA-exposto';
const R2_ENV = {
  EXERCISE_MEDIA_S3_BUCKET: 'bucket-e2e',
  EXERCISE_MEDIA_S3_ENDPOINT: ENDPOINT,
  EXERCISE_MEDIA_S3_ACCESS_KEY_ID: ACCESS_KEY,
  EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: SECRET,
};
const signedUrlFor = (key: string) => `${ENDPOINT}/bucket-e2e/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=e2e`;
const LEGACY = `/exercise-media/${'b'.repeat(64)}`;

const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};

function expectNoCredentials(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(ACCESS_KEY);
  expect(text).not.toContain('"media"');
}

describe('Mídia de exercício no R2 privado (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, R2_ENV);
    (getSignedUrl as jest.Mock).mockImplementation(async (_client, command: GetObjectCommand) => signedUrlFor(command.input.Key!));
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
    for (const key of Object.keys(R2_ENV)) delete process.env[key];
  });

  /** Catálogo do teste: R2 com 2 mídias, URL externa, caminho legado e sem mídia. */
  async function seedCatalog(accessToken: string) {
    const tag = Date.now();
    const r2 = await createExercise(app, accessToken, { name: `Rosca R2 ${tag}`, scope: 'private' });
    await prisma.exerciseMedia.createMany({
      data: [
        { exerciseId: r2.id, storageKey: `exercises/halteres/segunda-${tag}.gif`, contentType: 'image/gif', sizeBytes: 2, sha256: 'b'.repeat(64), createdAt: new Date('2026-01-02') },
        { exerciseId: r2.id, storageKey: `exercises/halteres/primeira-${tag}.gif`, contentType: 'image/gif', sizeBytes: 1, sha256: 'a'.repeat(64), createdAt: new Date('2026-01-01') },
      ],
    });
    const external = await createExercise(app, accessToken, { name: `Externo ${tag}`, scope: 'private', imageUrl: 'https://cdn.exemplo.com/externo.gif' });
    const legacy = await createExercise(app, accessToken, { name: `Legado ${tag}`, scope: 'private' });
    await prisma.exercise.update({ where: { id: legacy.id }, data: { imageUrl: LEGACY } });
    const none = await createExercise(app, accessToken, { name: `Sem mídia ${tag}`, scope: 'private' });
    return { tag, r2, external, legacy, none, r2Url: signedUrlFor(`exercises/halteres/primeira-${tag}.gif`) };
  }

  it('lista e detalhe: imageUrl = URL temporária do R2 (1ª mídia); fallbacks externo e legado intactos; nada gravado', async () => {
    const professional = await registerProfessional(app);
    const { tag, r2, external, legacy, none, r2Url } = await seedCatalog(professional.accessToken);

    const list = await request(app.getHttpServer())
      .get('/exercises')
      .query({ search: String(tag) })
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    const byId = new Map(list.body.map((e: { id: string; imageUrl: string | null }) => [e.id, e.imageUrl]));
    expect(byId.get(r2.id)).toBe(r2Url);
    expect(byId.get(external.id)).toBe('https://cdn.exemplo.com/externo.gif');
    expect(byId.get(legacy.id)).toBe(LEGACY);
    expect(byId.get(none.id)).toBeNull();
    expectNoCredentials(list.body);

    const detail = await request(app.getHttpServer())
      .get(`/exercises/${r2.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(detail.body.imageUrl).toBe(r2Url);
    expectNoCredentials(detail.body);

    // A URL temporária nunca é persistida.
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: r2.id } })).imageUrl).toBeNull();
  });

  it('URL temporária/do bucket não pode ser salva como Exercise.imageUrl (criar e editar); URL externa comum segue aceita', async () => {
    const professional = await registerProfessional(app);
    const { r2, r2Url, external } = await seedCatalog(professional.accessToken);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };

    await request(app.getHttpServer()).patch(`/exercises/${r2.id}`).set(auth).send({ imageUrl: r2Url }).expect(400);
    await request(app.getHttpServer()).patch(`/exercises/${r2.id}`).set(auth).send({ imageUrl: `${ENDPOINT}/bucket-e2e/x.gif` }).expect(400);
    await request(app.getHttpServer())
      .post('/exercises')
      .set(auth)
      .send({ name: `Copiado ${Date.now()}`, type: 'strength', scope: 'private', imageUrl: r2Url })
      .expect(400);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: r2.id } })).imageUrl).toBeNull();

    // Edição comum de um exercício com mídia no R2: responde com a URL resolvida, banco sem URL.
    const edited = await request(app.getHttpServer()).patch(`/exercises/${r2.id}`).set(auth).send({ description: 'Cotovelos fixos' }).expect(200);
    expect(edited.body.imageUrl).toBe(r2Url);
    expectNoCredentials(edited.body);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: r2.id } })).imageUrl).toBeNull();

    const externalEdit = await request(app.getHttpServer())
      .patch(`/exercises/${external.id}`)
      .set(auth)
      .send({ imageUrl: 'https://cdn.exemplo.com/novo.gif' })
      .expect(200);
    expect(externalEdit.body.imageUrl).toBe('https://cdn.exemplo.com/novo.gif');
  });

  it('treino: versão do profissional e resumo do cliente recebem a URL temporária no imageUrl', async () => {
    const professional = await registerProfessional(app);
    const { r2, r2Url, external } = await seedCatalog(professional.accessToken);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const workout = await createWorkout(app, professional.accessToken, client.id);
    const versionId = workout.currentVersion.id;
    const base = `/clients/${client.id}/workouts/${workout.id}/versions/${versionId}`;
    const auth = { Authorization: `Bearer ${professional.accessToken}` };

    const day = await request(app.getHttpServer()).post(`${base}/days`).set(auth).send({ name: 'Dia A' }).expect(201);
    await request(app.getHttpServer()).post(`${base}/days/${day.body.id}/exercises`).set(auth).send({ exerciseId: r2.id }).expect(201);
    await request(app.getHttpServer()).post(`${base}/days/${day.body.id}/exercises`).set(auth).send({ exerciseId: external.id }).expect(201);

    const version = await request(app.getHttpServer()).get(base).set(auth).expect(200);
    const images = version.body.days[0].exercises.map((ex: { exercise: { imageUrl: string | null } }) => ex.exercise.imageUrl);
    expect(images).toEqual([r2Url, 'https://cdn.exemplo.com/externo.gif']);
    expectNoCredentials(version.body);

    await request(app.getHttpServer()).post(`${base}/publish`).set(auth).expect(200);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(200);
    const summary = await request(app.getHttpServer())
      .get('/client/workout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(summary.body.workout.days[0].exercises.map((ex: { imageUrl: string | null }) => ex.imageUrl)).toEqual([
      r2Url,
      'https://cdn.exemplo.com/externo.gif',
    ]);
    expectNoCredentials(summary.body);
  });

  it('Assistente de Treino: proposta casa o exercício com GIF do R2; log de interação não guarda a URL temporária', async () => {
    const professional = await registerProfessional(app);
    const { r2, r2Url } = await seedCatalog(professional.accessToken);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(200);
    await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${professional.accessToken}`).expect(201);
    await request(app.getHttpServer()).post('/client/ai/consent').set('Authorization', `Bearer ${login.body.accessToken}`).expect(201);

    const set = { count: 3, reps: 12, repsMin: null, repsMax: null, restSeconds: null, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, tempo: null, notes: null };
    fakeProvider.generate.mockResolvedValueOnce({
      text: JSON.stringify({
        days: [{ name: 'Dia A', notes: null, exercises: [{ name: r2.name, muscleGroup: null, notes: null, setGroups: [set], warnings: [] }] }],
        warnings: [],
      }),
      model: 'fake-model',
    });

    const res = await request(app.getHttpServer())
      .post(`/clients/${client.id}/ai/generate`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ feature: 'organize_workout', workoutText: `${r2.name} 3x12` })
      .expect(201);

    const proposed = res.body.structuredData.days[0].exercises[0];
    expect(proposed.matchStatus).toBe('matched');
    expect(proposed.matchedExercise).toMatchObject({ id: r2.id, imageUrl: r2Url });
    expectNoCredentials(res.body);

    const log = await prisma.aiInteractionLog.findFirstOrThrow({
      where: { clientId: client.id, feature: 'organize_workout' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.responseText).not.toContain('X-Amz-Signature');
    expect(log.responseText).not.toContain(ENDPOINT);
    expect(JSON.parse(log.responseText!).days[0].exercises[0].matchedExercise).toMatchObject({ id: r2.id, imageUrl: null });
  });
});
