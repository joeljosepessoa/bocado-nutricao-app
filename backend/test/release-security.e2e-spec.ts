import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createClient, registerProfessional } from './helpers';

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

describe('Endurecimento de segurança para release', () => {
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

  it('um token de URL assinada de arquivo (mesmo segredo, sem sub/role) NÃO é aceito como access token', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ heightCm: 178, weightKg: 80 })
        .expect(201)
    ).body;
    const upload = await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const signed = await request(app.getHttpServer())
      .get(`/clients/${client.id}/evaluations/${evaluation.id}/photos/${upload.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    const fileToken = (signed.body.url as string).replace('/files/', '');

    // O token de arquivo continua funcionando no seu propósito...
    await request(app.getHttpServer()).get(`/files/${fileToken}`).expect(200);
    // ...mas nunca como credencial de API.
    await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${fileToken}`).expect(401);
  });

  it('JWT assinado com o segredo certo mas sem sub/role é rejeitado (401)', async () => {
    const forged = jwt.sign({ qualquer: 'coisa' }, { secret, expiresIn: 60 });
    await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('access token legítimo continua funcionando (sem regressão)', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${professional.accessToken}`).expect(200);
  });

  it('upload de foto acima do limite (10 MB) é cortado pelo multer com 413, sem carregar tudo na memória', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ heightCm: 178, weightKg: 80 })
        .expect(201)
    ).body;

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/evaluations/${evaluation.id}/photos`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .field('angle', 'front')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1024, 1), { filename: 'gigante.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });
});
