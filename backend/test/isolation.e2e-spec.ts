import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

describe('Isolamento profissional/cliente (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 8. Profissional acessando cliente próprio
  it('profissional consegue ler os dados do próprio cliente', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(client.id);
    expect(res.body.professionalId).toBe(professional.user.id);
  });

  // 9. Profissional tentando acessar cliente de outro profissional
  it('profissional A não consegue ler cliente do profissional B (404, não 403)', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    expect(res.body.message).toBe('Cliente não encontrado.');
  });

  it('listagem de clientes de um profissional nunca inclui clientes de outro', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client: clientOfA } = await createClient(app, professionalA.accessToken);
    await createClient(app, professionalB.accessToken);

    const res = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);

    const ids = res.body.items.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(clientOfA.id);
  });

  // 10. Cliente tentando acessar dado de outro cliente — não há rota com :id
  // para cliente algum; a rota /clients/:id é exclusiva de profissional.
  // O teste prova que não existe caminho, nem mesmo para o próprio id.
  it('cliente autenticado não consegue usar a rota /clients/:id (nem para o próprio id)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientSession = await login(app, client.user.email, temporaryPassword);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .expect(403);
  });

  it('cliente só acessa seus próprios dados via /clients/me', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientSession = await login(app, client.user.email, temporaryPassword);

    const res = await request(app.getHttpServer())
      .get('/clients/me')
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(client.id);
    // DTO restrito: nunca expõe professionalId ao próprio cliente
    expect(res.body.professionalId).toBeUndefined();
  });

  // 11. Cliente tentando acessar endpoint exclusivo de profissional — mesma
  // mecânica de RBAC (@Roles) que futuramente protege avaliação física.
  it('cliente autenticado recebe 403 em rota exclusiva de profissional (GET /clients)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientSession = await login(app, client.user.email, temporaryPassword);

    const res = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .expect(403);

    expect(res.body.message).toBe('Forbidden resource');
  });
});
