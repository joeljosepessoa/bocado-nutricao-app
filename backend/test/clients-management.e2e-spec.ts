import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, login, registerProfessional, uniqueEmail } from './helpers';

describe('Gerenciamento de clientes (e2e)', () => {
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

  // 1. Cadastro com phone/gender
  it('cadastro com phone e gender preenchidos persiste corretamente', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken, {
      phone: '+55 11 90000-0000',
      gender: 'feminino',
    });

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.phone).toBe('+55 11 90000-0000');
    expect(res.body.gender).toBe('feminino');
  });

  // 2. Busca por nome
  it('busca por trecho do nome retorna o cliente esperado', async () => {
    const professional = await registerProfessional(app);
    const marker = `Buscavel${Date.now()}`;
    const { client } = await createClient(app, professional.accessToken, {
      fullName: `Cliente ${marker} Silva`,
    });
    await createClient(app, professional.accessToken, { fullName: 'Outro Cliente Qualquer' });

    const res = await request(app.getHttpServer())
      .get(`/clients?search=${marker}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(client.id);
  });

  // 3. Busca por e-mail
  it('busca por trecho do e-mail retorna o cliente esperado', async () => {
    const professional = await registerProfessional(app);
    const email = uniqueEmail('buscavel-email');
    const { client } = await createClient(app, professional.accessToken, { email });

    const res = await request(app.getHttpServer())
      .get(`/clients?search=${email.split('@')[0]}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.items.map((c: { id: string }) => c.id)).toContain(client.id);
  });

  // 4. Filtro status=active
  it('filtro status=active exclui clientes inativos e arquivados', async () => {
    const professional = await registerProfessional(app);
    const { client: activeClient } = await createClient(app, professional.accessToken);
    const { client: toInactivate } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${toInactivate.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'inactive' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/clients?status=active')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const ids = res.body.items.map((c: { id: string }) => c.id);
    expect(ids).toContain(activeClient.id);
    expect(ids).not.toContain(toInactivate.id);
  });

  // 5. Listagem padrão exclui archived
  it('listagem sem filtro de status exclui clientes arquivados por padrão', async () => {
    const professional = await registerProfessional(app);
    const { client: activeClient } = await createClient(app, professional.accessToken);
    const { client: archivedClient } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${archivedClient.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'archived' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const ids = res.body.items.map((c: { id: string }) => c.id);
    expect(ids).toContain(activeClient.id);
    expect(ids).not.toContain(archivedClient.id);
  });

  // 6. status=all inclui os três
  it('listagem com status=all inclui clientes arquivados', async () => {
    const professional = await registerProfessional(app);
    const { client: archivedClient } = await createClient(app, professional.accessToken);
    await request(app.getHttpServer())
      .patch(`/clients/${archivedClient.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'archived' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/clients?status=all')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.items.map((c: { id: string }) => c.id)).toContain(archivedClient.id);
  });

  // 7. Listagem nunca inclui cliente de outro profissional (reforço)
  it('listagem filtrada por busca ainda respeita o isolamento entre profissionais', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const marker = `Isolado${Date.now()}`;
    await createClient(app, professionalA.accessToken, { fullName: `Cliente ${marker}` });

    const res = await request(app.getHttpServer())
      .get(`/clients?search=${marker}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);

    expect(res.body.items).toHaveLength(0);
  });

  // 8. GET /clients/:id retorna notes
  it('GET /clients/:id devolve as notas administrativas ao profissional dono', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'Prefere sessões à noite.' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(res.body.notes).toBe('Prefere sessões à noite.');
  });

  // 9. PATCH atualiza fullName/phone/notes
  it('PATCH atualiza fullName, phone e notes', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    const res = await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ fullName: 'Nome Atualizado', phone: '11999999999', notes: 'Nota atualizada' })
      .expect(200);

    expect(res.body.user.fullName).toBe('Nome Atualizado');
    expect(res.body.phone).toBe('11999999999');
    expect(res.body.notes).toBe('Nota atualizada');
  });

  // 10. PATCH com professionalId no corpo é rejeitado
  it('PATCH enviando professionalId no corpo é rejeitado pelo ValidationPipe', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ professionalId: 'outro-id-qualquer' })
      .expect(400);
  });

  // 11. PATCH por profissional não-dono
  it('PATCH por profissional que não é dono do cliente retorna 404', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ fullName: 'Tentativa Indevida' })
      .expect(404);
  });

  // 12. status=archived seta archivedAt; reverter limpa
  it('arquivar preenche archivedAt e reativar limpa o campo', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);

    const archived = await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'archived' })
      .expect(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const reactivated = await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'active' })
      .expect(200);
    expect(reactivated.body.archivedAt).toBeNull();
  });

  // 13. Cliente recebe 403 em rotas de gerenciamento
  it('cliente autenticado recebe 403 em GET /clients e PATCH /clients/:id', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const clientSession = await login(app, client.user.email, temporaryPassword);

    await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .send({ fullName: 'Tentativa do próprio cliente' })
      .expect(403);
  });

  // 14. GET /clients/me nunca inclui notes/status/professionalId
  it('GET /clients/me nunca expõe notes, status ou professionalId', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'Informação restrita ao profissional' })
      .expect(200);

    const clientSession = await login(app, client.user.email, temporaryPassword);
    const res = await request(app.getHttpServer())
      .get('/clients/me')
      .set('Authorization', `Bearer ${clientSession.accessToken}`)
      .expect(200);

    expect(res.body.notes).toBeUndefined();
    expect(res.body.status).toBeUndefined();
    expect(res.body.professionalId).toBeUndefined();
  });

  // Extra 1 — validação do filtro de status
  it('status inválido na query retorna 400', async () => {
    const professional = await registerProfessional(app);
    await request(app.getHttpServer())
      .get('/clients?status=nao-existe')
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(400);
  });

  // Extra 2 — decisão desta rodada: arquivar não revoga autenticação
  it('arquivar o cliente não impede login (status da carteira ≠ autorização de acesso)', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ status: 'archived' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: client.user.email, password: temporaryPassword })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  // Extra 3 — anti-enumeração também no PATCH de e-mail duplicado
  it('PATCH para um e-mail já usado por outro usuário retorna mensagem genérica', async () => {
    const professional = await registerProfessional(app);
    const takenEmail = uniqueEmail('ja-existe');
    await createClient(app, professional.accessToken, { email: takenEmail });
    const { client: otherClient } = await createClient(app, professional.accessToken);

    const res = await request(app.getHttpServer())
      .patch(`/clients/${otherClient.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ email: takenEmail })
      .expect(400);

    expect(res.body.message).toBe('Não foi possível concluir a atualização com os dados informados.');
  });
});
