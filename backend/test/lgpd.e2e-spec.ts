import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

describe('LGPD operacional (e2e — Fase 19)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientLogin = await login(app, client.user.email, temporaryPassword);
    return { professional, client, temporaryPassword, clientAccessToken: clientLogin.accessToken as string };
  }

  describe('Exportação de dados', () => {
    it('cliente exporta os próprios dados — retorna um pacote completo', async () => {
      const { clientAccessToken, client } = await setup();

      const res = await request(app.getHttpServer())
        .post('/client/data-export')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(201);

      expect(res.body).toMatchObject({
        requestId: expect.any(String),
        exportedAt: expect.any(String),
        profile: expect.any(Object),
        evaluations: expect.any(Array),
        reports: expect.any(Array),
        messages: expect.any(Array),
        appointments: expect.any(Array),
        devices: expect.any(Object),
        notificationPreferences: expect.any(Array),
      });

      const stored = await prisma.dataExportRequest.findUnique({ where: { id: res.body.requestId } });
      expect(stored?.clientId).toBe(client.id);
      expect(stored?.status).toBe('ready');
    });

    it('exportar dados NUNCA marca mensagem como lida (sem efeito colateral)', async () => {
      const { professional, client, clientAccessToken } = await setup();

      await request(app.getHttpServer())
        .post(`/clients/${client.id}/messages`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ body: 'Mensagem antes da exportação' })
        .expect(201);

      const exportRes = await request(app.getHttpServer())
        .post('/client/data-export')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(201);
      expect(exportRes.body.messages).toHaveLength(1);
      expect(exportRes.body.messages[0].readAt).toBeNull();

      const stillUnread = await prisma.message.findFirst({ where: { thread: { clientId: client.id } } });
      expect(stillUnread?.readAt).toBeNull();

      // agora sim: abrir a conversa de verdade marca como lida
      await request(app.getHttpServer())
        .get('/client/messages')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(200);
      const nowRead = await prisma.message.findFirst({ where: { thread: { clientId: client.id } } });
      expect(nowRead?.readAt).not.toBeNull();
    });

    it('profissional não acessa a rota de exportação do cliente (403)', async () => {
      const { professional } = await setup();
      await request(app.getHttpServer())
        .post('/client/data-export')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(403);
    });
  });

  describe('Exclusão de conta', () => {
    it('senha incorreta bloqueia a exclusão (401), conta permanece intacta', async () => {
      const { clientAccessToken, client } = await setup();

      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: 'senha-errada-qualquer' })
        .expect(401);

      const user = await prisma.user.findUnique({ where: { id: client.id } });
      expect(user?.anonymizedAt).toBeNull();
      expect(user?.email).toBe(client.user.email);
    });

    it('senha correta exclui (anonimiza) a conta — dados pessoais viram placeholder, dado clínico permanece', async () => {
      const { clientAccessToken, client, temporaryPassword } = await setup();

      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: temporaryPassword })
        .expect(204);

      const user = await prisma.user.findUnique({ where: { id: client.id } });
      expect(user?.anonymizedAt).not.toBeNull();
      expect(user?.email).toBe(`deleted-${client.id}@bocadodenutricao.invalid`);
      expect(user?.fullName).toBe('Cliente removido');

      const clientRow = await prisma.client.findUnique({ where: { id: client.id } });
      expect(clientRow?.phone).toBeNull();
      expect(clientRow?.notes).toBeNull();
      expect(clientRow?.status).toBe('archived');
      expect(clientRow?.archivedAt).not.toBeNull();
      // a linha do cliente continua existindo — nunca é apagada
      expect(clientRow).not.toBeNull();

      const deletionRequest = await prisma.accountDeletionRequest.findUnique({ where: { clientId: client.id } });
      expect(deletionRequest).not.toBeNull();
    });

    it('depois de excluída, a senha antiga nunca mais funciona para login', async () => {
      const { clientAccessToken, client, temporaryPassword } = await setup();
      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: temporaryPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: client.user.email, password: temporaryPassword })
        .expect(401);
    });

    it('exclusão revoga sessões ativas imediatamente (refresh token já emitido para de funcionar)', async () => {
      const professional = await registerProfessional(app);
      const created = await createClient(app, professional.accessToken);
      const clientLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: created.client.user.email, password: created.temporaryPassword })
        .expect(200);
      const clientAccessToken = clientLoginRes.body.accessToken as string;
      const clientRefreshToken = clientLoginRes.body.refreshToken as string;

      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: created.temporaryPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: clientRefreshToken })
        .expect(401);
    });

    it('não é possível excluir a mesma conta duas vezes (409)', async () => {
      const { clientAccessToken, temporaryPassword } = await setup();
      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: temporaryPassword })
        .expect(204);

      // A revogação (Fase 19, mesmo mecanismo da Fase 13/15) só derruba o
      // refresh token — o access token JWT continua válido até expirar
      // sozinho (stateless, ~15min), então dá pra reusar o mesmo token
      // aqui pra provar a segunda tentativa. A senha original também não
      // vale mais nada nesse ponto, então a checagem que bloqueia é a de
      // "já existe accountDeletionRequest", não a de senha.
      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: temporaryPassword })
        .expect(409);
    });

    it('profissional não acessa a rota de exclusão de conta do cliente (403)', async () => {
      const { professional } = await setup();
      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ currentPassword: 'qualquer' })
        .expect(403);
    });

    it('validação: currentPassword vazio é rejeitado', async () => {
      const { clientAccessToken } = await setup();
      await request(app.getHttpServer())
        .post('/client/account-deletion')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .send({ currentPassword: '' })
        .expect(400);
    });
  });
});
