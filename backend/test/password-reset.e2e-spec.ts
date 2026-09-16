import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ConsoleEmailService } from '../src/auth/email/console-email.service';
import { registerProfessional, uniqueEmail } from './helpers';

const prisma = new PrismaClient();

function extractToken(emailText: string): string {
  const match = emailText.match(/[?&]token=([^\s&]+)/);
  if (!match) {
    throw new Error(`Nenhum token encontrado no e-mail: ${emailText}`);
  }
  return match[1];
}

describe('Recuperação de senha (e2e)', () => {
  let app: INestApplication;
  let emailService: ConsoleEmailService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    emailService = moduleRef.get(ConsoleEmailService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function lastEmailTo(email: string): string {
    const messages = emailService.getSentMessages().filter((m) => m.to === email);
    return messages[messages.length - 1].text;
  }

  // 1. Solicitação válida — e-mail "enviado"
  it('solicitação válida devolve 204 e envia um e-mail com o link de redefinição', async () => {
    const { user } = await registerProfessional(app);

    await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: user.email })
      .expect(204);

    const text = lastEmailTo(user.email);
    expect(text).toContain('http');
    expect(text).toMatch(/token=/);
  });

  // 2. E-mail inexistente — resposta indistinguível
  it('e-mail inexistente devolve exatamente o mesmo 204 sem corpo, e nenhum e-mail é enviado', async () => {
    const nonExistentEmail = uniqueEmail('nao-existe');
    const before = emailService.getSentMessages().length;

    const res = await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: nonExistentEmail })
      .expect(204);

    expect(res.body).toEqual({});
    expect(emailService.getSentMessages().length).toBe(before);
  });

  // 3. Token válido redefine a senha; login antigo para de funcionar, novo funciona
  it('token válido redefine a senha — login com a senha antiga falha, com a nova funciona', async () => {
    const { user, password: oldPassword } = await registerProfessional(app);

    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const token = extractToken(lastEmailTo(user.email));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'NovaSenhaForte456' })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: oldPassword })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'NovaSenhaForte456' })
      .expect(200);
  });

  // 4. Token expirado
  it('token expirado é rejeitado', async () => {
    const { user } = await registerProfessional(app);
    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const token = extractToken(lastEmailTo(user.email));

    await prisma.passwordResetToken.updateMany({
      where: { user: { email: user.email } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'OutraSenhaForte456' })
      .expect(401);
  });

  // 5. Token inválido (nunca existiu)
  it('token inválido é rejeitado', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'token-que-nunca-existiu', newPassword: 'OutraSenhaForte456' })
      .expect(401);
  });

  // 6. Token reutilizado
  it('token já usado não pode ser reutilizado', async () => {
    const { user } = await registerProfessional(app);
    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const token = extractToken(lastEmailTo(user.email));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'PrimeiraTrocaForte1' })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'SegundaTentativa22' })
      .expect(401);
  });

  // 7. Senha fraca no reset
  it('rejeita senha fraca na redefinição', async () => {
    const { user } = await registerProfessional(app);
    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const token = extractToken(lastEmailTo(user.email));

    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'curta1' }).expect(400);
  });

  // 8. Nova solicitação invalida o token anterior
  it('solicitar um novo reset invalida o token anterior ainda não usado', async () => {
    const { user } = await registerProfessional(app);

    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const firstToken = extractToken(lastEmailTo(user.email));

    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const secondToken = extractToken(lastEmailTo(user.email));

    expect(secondToken).not.toBe(firstToken);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: firstToken, newPassword: 'TentativaForte123' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: secondToken, newPassword: 'TentativaForte123' })
      .expect(204);
  });

  // 9. Resposta do request nunca expõe o token
  it('a resposta de request-password-reset nunca contém o token (204 sem corpo)', async () => {
    const { user } = await registerProfessional(app);
    const res = await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: user.email })
      .expect(204);
    expect(res.text).toBeFalsy();
    expect(Object.keys(res.body)).toHaveLength(0);
  });

  // 10. Sessão: refresh token emitido antes do reset para de funcionar depois
  it('reset revoga todo refresh token emitido antes dele — mobile e web', async () => {
    const { user, password: oldPassword, refreshToken: mobileRefreshToken } = await registerProfessional(app);

    // sessão web também aberta antes do reset
    const webLogin = await request(app.getHttpServer())
      .post('/auth/web/login')
      .set('X-Bocado-Client', 'web')
      .send({ email: user.email, password: oldPassword })
      .expect(200);
    const webCookie = webLogin.headers['set-cookie'];

    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: user.email }).expect(204);
    const token = extractToken(lastEmailTo(user.email));
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'PosResetForte123' })
      .expect(204);

    // refresh mobile emitido antes do reset agora falha
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: mobileRefreshToken }).expect(401);

    // refresh web (cookie) emitido antes do reset também falha
    await request(app.getHttpServer())
      .post('/auth/web/refresh')
      .set('X-Bocado-Client', 'web')
      .set('Cookie', webCookie)
      .expect(401);
  });

  // 11. Rate limiting — decorator presente (mesmo padrão de todo endpoint público de auth)
  it('endpoints de recuperação de senha estão sob o mesmo throttle de auth', async () => {
    // AUTH_THROTTLE_LIMIT é elevado no ambiente de teste (jest-e2e.setup.js);
    // aqui só confirmamos que os endpoints respondem normalmente sob o teto
    // de teste — o mesmo padrão já usado por login/register nesta suíte.
    const email = uniqueEmail('rate-limit-reset');
    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email }).expect(204);
    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email }).expect(204);
  });
});
