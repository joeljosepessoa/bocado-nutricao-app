import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// O profissional altera o nome da própria conta (tela "Configurações" do painel).
describe('Conta do profissional — alterar o próprio nome (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('troca o nome ("teste" → "Joel") sem mexer em e-mail, pacientes ou na sessão', async () => {
    const professional = await registerProfessional(app, { fullName: 'teste' });
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client } = await createClient(app, professional.accessToken, { fullName: 'Paciente Que Fica' });
    const before = await request(app.getHttpServer()).get('/professionals/me').set(auth).expect(200);

    const res = await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({ fullName: '  Joel   Pessoa ' }).expect(200);
    expect(res.body.user).toEqual({ id: before.body.user.id, email: before.body.user.email, fullName: 'Joel Pessoa' });

    // O mesmo token continua valendo e o nome novo aparece em qualquer leitura da conta.
    const me = await request(app.getHttpServer()).get('/users/me').set(auth).expect(200);
    expect(me.body).toMatchObject({ fullName: 'Joel Pessoa', email: before.body.user.email, role: 'professional' });
    const session = await login(app, before.body.user.email, professional.password);
    expect(session.user.fullName).toBe('Joel Pessoa');

    // Os pacientes e o vínculo com o profissional não mudam.
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: client.id }, include: { user: true } });
    expect(stored.professionalId).toBe(before.body.id);
    expect(stored.user.fullName).toBe('Paciente Que Fica');
  });

  it('nome em branco, longo demais ou campo que não é o nome são recusados; nada é alterado', async () => {
    const professional = await registerProfessional(app, { fullName: 'Nome Original' });
    const auth = { Authorization: `Bearer ${professional.accessToken}` };

    await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({ fullName: '   ' }).expect(400);
    await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({ fullName: 'x'.repeat(121) }).expect(400);
    await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({}).expect(400);
    // E-mail, papel e senha não entram por esta rota.
    await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({ fullName: 'Novo', email: 'outro@example.com' }).expect(400);
    await request(app.getHttpServer()).patch('/professionals/me').set(auth).send({ fullName: 'Novo', role: 'admin' }).expect(400);

    const me = await request(app.getHttpServer()).get('/professionals/me').set(auth).expect(200);
    expect(me.body.user.fullName).toBe('Nome Original');
  });

  it('só o próprio profissional altera a própria conta: sem login 401, paciente 403, e um profissional não altera o outro', async () => {
    const professional = await registerProfessional(app, { fullName: 'Profissional A' });
    const other = await registerProfessional(app, { fullName: 'Profissional B' });
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientSession = await login(app, client.user.email, temporaryPassword);

    await request(app.getHttpServer()).patch('/professionals/me').send({ fullName: 'Invasor' }).expect(401);
    await request(app.getHttpServer()).patch('/professionals/me').set('Authorization', `Bearer ${clientSession.accessToken}`).send({ fullName: 'Invasor' }).expect(403);

    // A rota só conhece "me": o que B envia muda B, nunca A.
    await request(app.getHttpServer()).patch('/professionals/me').set('Authorization', `Bearer ${other.accessToken}`).send({ fullName: 'B Renomeado' }).expect(200);
    const a = await request(app.getHttpServer()).get('/professionals/me').set('Authorization', `Bearer ${professional.accessToken}`).expect(200);
    expect(a.body.user.fullName).toBe('Profissional A');
  });
});
