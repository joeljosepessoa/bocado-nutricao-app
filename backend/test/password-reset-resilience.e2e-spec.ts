import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/auth/email/email.service';
import { registerProfessional } from './helpers';

describe('Redefinição de senha não depende do envio de e-mail (SMTP lento ou fora do ar)', () => {
  let app: INestApplication;
  const send = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => send.mockReset());

  afterAll(async () => {
    await app.close();
  });

  it('SMTP recusando o envio: e-mail existente responde 204, igual ao inexistente — nada revela o cadastro', async () => {
    send.mockRejectedValue(new Error('smtp fora do ar'));
    const professional = await registerProfessional(app);

    const existing = await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: professional.user.email });
    const unknown = await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: `nao.existe.${Date.now()}@example.com` });

    expect(existing.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(send).toHaveBeenCalledTimes(1); // só o existente tentou enviar
  });

  it('SMTP que nunca responde: a requisição NÃO espera o envio', async () => {
    send.mockReturnValue(new Promise(() => undefined));
    const professional = await registerProfessional(app);

    const started = Date.now();
    await request(app.getHttpServer())
      .post('/auth/request-password-reset')
      .send({ email: professional.user.email })
      .expect(204);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a mensagem entregue ao provedor carrega o link com o token e o destinatário certo', async () => {
    send.mockResolvedValue(undefined);
    const professional = await registerProfessional(app);

    await request(app.getHttpServer()).post('/auth/request-password-reset').send({ email: professional.user.email }).expect(204);

    const message = send.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(message.to).toBe(professional.user.email);
    expect(message.subject).toContain('Redefinição de senha');
    expect(message.text).toMatch(/\?token=[A-Za-z0-9_-]{20,}/);
  });
});
