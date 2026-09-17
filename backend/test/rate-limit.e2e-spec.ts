// jest-e2e.setup.js eleva AUTH_THROTTLE_LIMIT para 1000 (para as outras
// suítes não travarem sob o teto real). Aqui sobrescrevemos de volta ANTES
// de qualquer import — como o TypeScript compila `import` para `require()`
// no topo do arquivo, um `require()` explícito depois do `process.env` é a
// única forma de garantir que auth-http.util.ts leia o valor de produção
// (5/60s) neste arquivo, sem afetar as outras suítes (cada arquivo de teste
// tem seu próprio module registry no Jest).
process.env.AUTH_THROTTLE_LIMIT = '5';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Test } = require('@nestjs/testing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../src/app.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AUTH_THROTTLE_LIMIT } = require('../src/auth/auth-http.util');

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

describe('Rate limiting em valor de produção (e2e — Fase 21)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('confirma que este arquivo está rodando sob o teto real (5/60s), não o de teste', () => {
    expect(AUTH_THROTTLE_LIMIT).toBe(5);
  });

  it('POST /auth/login bloqueia com 429 após exceder o limite real de produção', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'rate-limit-probe@example.com', password: 'senha-errada' });

    const results = [];
    for (let i = 0; i < AUTH_THROTTLE_LIMIT + 1; i++) {
      results.push(await attempt());
    }

    const statuses = results.map((r) => r.status);
    expect(statuses.slice(0, AUTH_THROTTLE_LIMIT)).not.toContain(429);
    expect(statuses[AUTH_THROTTLE_LIMIT]).toBe(429);
  });
});
