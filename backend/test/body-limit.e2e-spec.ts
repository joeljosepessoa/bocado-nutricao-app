import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Limite de tamanho de corpo HTTP (e2e — Fase 21)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // main.ts desliga o body-parser default do Nest e registra o dele com
    // limite explícito (ver main.ts) — replicado aqui porque specs sobem
    // o Nest diretamente, sem passar pelo bootstrap real.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(json({ limit: '1mb' }));
    app.use(urlencoded({ extended: true, limit: '1mb' }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('corpo JSON acima de 1mb é rejeitado com 413', async () => {
    const oversized = 'a'.repeat(1024 * 1024 + 1024);
    const res = await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email: 'x@example.com', password: 'x', fullName: oversized });

    expect(res.status).toBe(413);
  });

  it('corpo dentro do limite passa da checagem de tamanho (segue para validação normal)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email: 'not-an-email', password: 'x', fullName: 'Alguém' });

    // Não é 413 (o parser aceitou o corpo) — o 400 vem da validação normal
    // do DTO (e-mail inválido), prova de que o limite não bloqueou um
    // corpo pequeno legítimo.
    expect(res.status).toBe(400);
  });
});
