import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, registerProfessional } from './helpers';

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

describe('Storage — arquivos privados, URLs assinadas e isolamento', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let secret: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
    secret = moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  async function uploadPhoto() {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ heightCm: 178, weightKg: 80 })
        .expect(201)
    ).body;
    const photo = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .field('angle', 'front')
        .attach('file', JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' })
        .expect(201)
    ).body;
    return { professional, client, evaluation, photo };
  }

  it('foto: upload -> URL assinada -> download idêntico, sem cache e apenas via token', async () => {
    const { professional, client, evaluation, photo } = await uploadPhoto();
    const signed = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${photo.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(signed.body.url).toMatch(/^\/files\/[\w-]+\.[\w-]+\.[\w-]+$/);
    const download = await request(app.getHttpServer()).get(signed.body.url).expect(200);
    expect(download.headers['content-type']).toBe('image/jpeg');
    expect(download.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(download.body as Buffer, JPEG)).toBe(0);
  });

  it('a foto de um cliente NÃO é acessível por outro profissional (nem gera URL assinada)', async () => {
    const { client, evaluation, photo } = await uploadPhoto();
    const intruder = await registerProfessional(app);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${photo.id}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(404);
  });

  it('sem autenticação não há como obter a URL assinada da foto', async () => {
    const { client, evaluation, photo } = await uploadPhoto();
    await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${photo.id}`)
      .expect(401);
  });

  it('/files/:token com lixo devolve 404 (não 500) — link inválido não é erro do servidor', async () => {
    await request(app.getHttpServer()).get('/files/isto-nao-e-um-jwt').expect(404);
    await request(app.getHttpServer()).get('/files/aaa.bbb.ccc').expect(404);
  });

  it('/files/:token EXPIRADO devolve 404 (não 500)', async () => {
    const expired = jwt.sign(
      { storageKey: 'qualquer.jpeg', contentType: 'image/jpeg', purpose: 'photo-download' },
      { secret, expiresIn: -10 },
    );
    await request(app.getHttpServer()).get(`/files/${expired}`).expect(404);
  });

  it('/files/:token assinado com OUTRO segredo é rejeitado', async () => {
    const forged = jwt.sign(
      { storageKey: 'qualquer.jpeg', contentType: 'image/jpeg', purpose: 'photo-download' },
      { secret: 'outro-segredo-qualquer-de-32-caracteres-ou-mais', expiresIn: 60 },
    );
    await request(app.getHttpServer()).get(`/files/${forged}`).expect(404);
  });

  it('defesa em profundidade: token VÁLIDO com chave apontando para FORA do storage (../) não devolve o arquivo-isca', async () => {
    // Arquivo real ao lado (fora) da pasta de storage: se a chave escapasse do diretório, ele seria devolvido.
    const storageDir = resolve(app.get(ConfigService).get<string>('STORAGE_LOCAL_DIR') ?? '../storage');
    const decoyName = `decoy-fora-do-storage-${Date.now()}.txt`;
    const decoyPath = join(dirname(storageDir), decoyName);
    writeFileSync(decoyPath, 'CONTEUDO-SECRETO-FORA-DO-STORAGE');
    try {
      const keys = [`../${decoyName}`, '..\\' + decoyName, decoyPath, `a/../../${decoyName}`];
      for (const storageKey of keys) {
        const token = jwt.sign({ storageKey, contentType: 'text/plain', purpose: 'photo-download' }, { secret, expiresIn: 60 });
        const res = await request(app.getHttpServer()).get(`/files/${token}`);
        expect(res.text).not.toContain('CONTEUDO-SECRETO-FORA-DO-STORAGE');
        expect([400, 404]).toContain(res.status);
      }
    } finally {
      rmSync(decoyPath, { force: true });
    }
  });
});
