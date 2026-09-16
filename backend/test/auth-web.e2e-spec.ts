import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, registerProfessional, uniqueEmail } from './helpers';

const prisma = new PrismaClient();

const WEB_HEADER = { 'X-Bocado-Client': 'web' };

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

describe('Autenticação do painel web (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts registra isto no bootstrap real; specs sobem o Nest
    // diretamente (sem passar por main.ts), então precisa registrar aqui
    // também para os testes que leem o cookie de refresh do painel web.
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // 1. Login web
  it('login web devolve accessToken+user no corpo, refreshToken só como cookie HttpOnly', async () => {
    const email = uniqueEmail('web-prof');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional Web' })
      .expect(201);

    const res = await request(app.getHttpServer()).post('/auth/web/login').send({ email, password }).expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.refreshToken).toBeUndefined();

    const cookie = extractCookie(res.headers['set-cookie'] as unknown as string[], 'bocado_refresh_token');
    expect(cookie).toBeDefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
  });

  // 2. Cliente não pode logar no painel
  it('login web rejeita conta de cliente com 403', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .post('/auth/web/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(403);
  });

  // 3. Credenciais inválidas — mesma mensagem genérica
  it('login web com credenciais inválidas retorna 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/web/login')
      .send({ email: uniqueEmail('nao-existe'), password: 'qualquer123' })
      .expect(401);
  });

  // 4. Refresh sem cookie
  it('refresh web sem cookie retorna 401', async () => {
    await request(app.getHttpServer()).post('/auth/web/refresh').set(WEB_HEADER).expect(401);
  });

  // 5. CSRF — sem o cabeçalho customizado, refresh/logout são recusados mesmo com cookie válido
  it('refresh e logout web sem o cabeçalho X-Bocado-Client são recusados (defesa CSRF)', async () => {
    const email = uniqueEmail('web-csrf');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional CSRF' })
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/web/login').send({ email, password }).expect(200);

    await agent.post('/auth/web/refresh').expect(403);
    await agent.post('/auth/web/logout').expect(403);
  });

  // 6. Refresh rotaciona o cookie
  it('refresh web rotaciona o refresh token (cookie novo, cookie antigo invalidado)', async () => {
    const email = uniqueEmail('web-rotate');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional Rotate' })
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent.post('/auth/web/login').send({ email, password }).expect(200);
    const firstCookie = extractCookie(loginRes.headers['set-cookie'] as unknown as string[], 'bocado_refresh_token');

    const refreshRes = await agent.post('/auth/web/refresh').set(WEB_HEADER).expect(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    const secondCookie = extractCookie(refreshRes.headers['set-cookie'] as unknown as string[], 'bocado_refresh_token');
    expect(secondCookie).toBeDefined();
    expect(secondCookie).not.toBe(firstCookie);

    // O agent já está com o cookie novo; forçar o cookie antigo de volta
    // simula reapresentar um refresh token já usado — deve ser tratado
    // como indício de roubo (mesma detecção de reuso da Fase 2).
    const rawOld = firstCookie?.split('=')[1];
    await request(app.getHttpServer())
      .post('/auth/web/refresh')
      .set(WEB_HEADER)
      .set('Cookie', `bocado_refresh_token=${rawOld}`)
      .expect(401);
  });

  // 7. Logout revoga no backend e limpa o cookie
  it('logout web revoga o refresh token no banco e limpa o cookie', async () => {
    const email = uniqueEmail('web-logout');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional Logout' })
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/web/login').send({ email, password }).expect(200);

    const logoutRes = await agent.post('/auth/web/logout').set(WEB_HEADER).expect(204);
    const clearedCookie = (logoutRes.headers['set-cookie'] as unknown as string[])?.find((c) =>
      c.startsWith('bocado_refresh_token='),
    );
    expect(clearedCookie).toMatch(/bocado_refresh_token=;/);

    // Sessão já revogada — tentar renovar com o mesmo cookie (se reenviado) falha
    await agent.post('/auth/web/refresh').set(WEB_HEADER).expect(401);
  });

  // 8. Isolamento entre canais — web e mobile são sessões independentes
  it('sessão mobile e sessão web do mesmo profissional coexistem; logout de uma não afeta a outra', async () => {
    const email = uniqueEmail('web-mobile');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional Dual' })
      .expect(201);

    // sessão "mobile" — fluxo JSON já existente, sem alteração
    const mobileLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(mobileLogin.body.refreshToken).toBeDefined();

    // sessão "web" — cookie
    const webAgent = request.agent(app.getHttpServer());
    await webAgent.post('/auth/web/login').send({ email, password }).expect(200);

    // logout web não revoga o refresh token mobile
    await webAgent.post('/auth/web/logout').set(WEB_HEADER).expect(204);
    const mobileRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: mobileLogin.body.refreshToken })
      .expect(200);
    expect(mobileRefresh.body.accessToken).toBeDefined();
  });

  // 9. O JWT de acesso emitido pelo login web funciona nas rotas normais da API
  it('access token do login web autentica normalmente em rotas protegidas', async () => {
    const email = uniqueEmail('web-access');
    const password = 'SenhaForte123';
    await request(app.getHttpServer())
      .post('/auth/register-professional')
      .send({ email, password, fullName: 'Profissional Access' })
      .expect(201);

    const loginRes = await request(app.getHttpServer()).post('/auth/web/login').send({ email, password }).expect(200);

    await request(app.getHttpServer())
      .get('/professionals/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
  });
});
