import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { registerProfessional, uniqueEmail } from './helpers';

describe('Autenticação (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jwtService = moduleRef.get(JwtService);
    configService = moduleRef.get(ConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Login válido
  it('login com credenciais válidas retorna par de tokens e dados do usuário', async () => {
    const { user, password } = await registerProfessional(app);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(user.email);
  });

  // 2. Senha inválida
  it('login com senha inválida retorna 401 com mensagem genérica', async () => {
    const { user } = await registerProfessional(app);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaErrada999' })
      .expect(401);

    expect(res.body.message).toBe('Credenciais inválidas.');
  });

  it('login com e-mail inexistente retorna a mesma mensagem genérica (anti-enumeração)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail('nao-existe'), password: 'QualquerSenha123' })
      .expect(401);

    expect(res.body.message).toBe('Credenciais inválidas.');
  });

  // 3. Token expirado
  it('rota protegida com access token expirado retorna 401', async () => {
    const { user } = await registerProfessional(app);
    const expiredToken = jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: configService.get<string>('JWT_ACCESS_SECRET'), expiresIn: '-10s' },
    );

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  // 4. Refresh válido
  it('refresh com token válido devolve novo par de tokens', async () => {
    const { user, password } = await registerProfessional(app);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(refreshRes.body.refreshToken).toEqual(expect.any(String));
    expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken);

    // o novo access token funciona
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);
  });

  // 5. Refresh reutilizado
  it('reapresentar um refresh token já rotacionado revoga a família inteira', async () => {
    const { user, password } = await registerProfessional(app);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const oldRefreshToken = loginRes.body.refreshToken;

    const firstRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    // reapresenta o token antigo, já usado
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    // mesmo o token novo (mesma família) deveria ter sido revogado em cascata
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh.body.refreshToken })
      .expect(401);
  });

  // 6. Logout
  it('logout revoga o refresh token e um refresh subsequente falha', async () => {
    const { user, password } = await registerProfessional(app);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(401);
  });

  // 7. Acesso sem autenticação
  it('acesso a rota protegida sem token retorna 401', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('/health continua público mesmo com o guard global ativo', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
