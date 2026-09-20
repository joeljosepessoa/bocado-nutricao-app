import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomBytes } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WorkoutClientSummaryDto } from '../src/workouts/dto/workout-client-summary.dto';
import { createClient, login, registerProfessional } from './helpers';

// GIF 1x1 válido (43 bytes) + bytes aleatórios no fim -> hash único por execução,
// sem colidir com os GIFs reais do piloto que estão no mesmo diretório de storage.
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

describe('Mídia de exercício (piloto de GIFs)', () => {
  let app: INestApplication;
  let mediaDir: string;
  const gif = Buffer.concat([TINY_GIF, randomBytes(16)]);
  const sha = createHash('sha256').update(gif).digest('hex');

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const storageDir = resolve(moduleRef.get(ConfigService).get<string>('STORAGE_LOCAL_DIR') ?? '../storage');
    mediaDir = join(storageDir, 'exercise-media');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, `${sha}.gif`), gif);
  });

  afterAll(async () => {
    rmSync(join(mediaDir, `${sha}.gif`), { force: true });
    await app.close();
  });

  it('exige autenticação (não é URL pública)', async () => {
    await request(app.getHttpServer()).get(`/exercise-media/${sha}`).expect(401);
  });

  it('profissional autenticado recebe o GIF com cache longo imutável e ETag do hash', async () => {
    const professional = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .get(`/exercise-media/${sha}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toBe('image/gif');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(res.headers['etag']).toBe(`"${sha}"`);
    expect(Buffer.compare(res.body as Buffer, gif)).toBe(0);
  });

  it('If-None-Match com o ETag devolve 304 sem corpo (o celular não baixa de novo)', async () => {
    const professional = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .get(`/exercise-media/${sha}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .set('If-None-Match', `"${sha}"`)
      .expect(304);
    expect(res.text ?? '').toBe('');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
  });

  it('cliente autenticado também recebe (o app do cliente exibe a demonstração)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    await request(app.getHttpServer())
      .get(`/exercise-media/${sha}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('hash inexistente ou formato inválido (incl. tentativa de path traversal) devolve 404', async () => {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };

    await request(app.getHttpServer()).get(`/exercise-media/${'0'.repeat(64)}`).set(auth).expect(404);
    await request(app.getHttpServer()).get('/exercise-media/nao-e-um-hash').set(auth).expect(404);
    await request(app.getHttpServer()).get(`/exercise-media/${sha.toUpperCase()}`).set(auth).expect(404);
    await request(app.getHttpServer()).get('/exercise-media/..%2F..%2Fpackage.json').set(auth).expect(404);
  });

  it('hash válido sem arquivo em exercise-media/ devolve 404 (a chave lida é sempre exercise-media/<hash>.gif)', async () => {
    const professional = await registerProfessional(app);
    const unknownSha = createHash('sha256').update(`sem-arquivo-${Date.now()}`).digest('hex');
    await request(app.getHttpServer())
      .get(`/exercise-media/${unknownSha}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(404);
  });
});

describe('Contrato do DTO do cliente com mídia de exercício', () => {
  it('imageUrl relativo (/exercise-media/<sha>) passa intacto para o app do cliente', () => {
    const version = {
      id: 'v-1',
      workoutId: 'w-1',
      status: 'published',
      days: [
        {
          id: 'd-1',
          name: 'Dia A',
          order: 0,
          exercises: [
            {
              id: 'we-1',
              order: 0,
              exercise: {
                name: 'Agachamento livre',
                muscleGroup: 'Quadríceps, glúteos',
                equipment: 'Barra e anilhas',
                videoUrl: null,
                imageUrl: `/exercise-media/${'a'.repeat(64)}`,
              },
              sets: [],
            },
          ],
        },
      ],
    };
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(version as never)!;
    expect(dto.days[0].exercises[0].imageUrl).toBe(`/exercise-media/${'a'.repeat(64)}`);
  });
});
