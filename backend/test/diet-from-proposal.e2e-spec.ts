import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createFood, registerProfessional } from './helpers';

const prisma = new PrismaClient();

/** Proposta revisada (Assistente de Dieta) → rascunho; editar/excluir respeitando o versionamento. */
describe('Dieta a partir de proposta + editar/excluir (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  async function setup() {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client } = await createClient(app, professional.accessToken);
    // 100 g → 130 kcal (o cálculo é do backend, nunca da IA).
    const rice = await createFood(app, professional.accessToken, { name: `Arroz ${Date.now()}`, kcalPer100: 130, scope: 'private' });
    const base = `/clients/${client.id}/diets`;
    return { professional, auth, client, rice, base };
  }

  const proposal = (foodId: string, quantity = 150, extra: Record<string, unknown> = {}) => ({
    meals: [{ name: 'ALMOÇO', time: '12:30', notes: null, foods: [{ foodId, quantity, unit: 'g' }] }],
    ...extra,
  });

  it('sem dieta: cria dieta nova com versão 1 em RASCUNHO (nunca publica) e calcula kcal no backend', async () => {
    const { auth, client, rice, base } = await setup();
    const res = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id)).expect(201);
    expect(res.body.currentVersion).toMatchObject({ versionNumber: 1, status: 'draft' });
    const meal = res.body.currentVersion.meals[0];
    expect(meal).toMatchObject({ name: 'ALMOÇO', time: '12:30' });
    expect(meal.foods[0]).toMatchObject({ foodId: rice.id, quantity: 150, unit: 'g', kcal: 195 });
    expect(await prisma.dietVersion.count({ where: { diet: { clientId: client.id }, status: 'published' } })).toBe(0);
  });

  it('dieta publicada: proposta vira NOVA versão em rascunho; a publicada fica intacta', async () => {
    const { auth, rice, base } = await setup();
    const first = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id, 100)).expect(201);
    const dietId = first.body.id;
    const v1 = first.body.currentVersion.id;
    await http().post(`${base}/${dietId}/versions/${v1}/publish`).set(auth).expect(200);

    const second = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id, 200)).expect(201);
    expect(second.body.id).toBe(dietId);
    const versions = second.body.versions.map((v: { versionNumber: number; status: string }) => [v.versionNumber, v.status]);
    expect(versions).toEqual([
      [2, 'draft'],
      [1, 'published'],
    ]);
    const published = await http().get(`${base}/${dietId}/versions/${v1}`).set(auth).expect(200);
    expect(published.body.meals[0].foods[0].quantity).toBe(100);

    // Versão publicada não aceita edição destrutiva.
    await http().post(`${base}/${dietId}/versions/${v1}/meals`).set(auth).send({ name: 'Lanche' }).expect(409);
  });

  it('rascunho aberto: só é substituído com confirmação (replaceDraft); sem ela, 409 e nada muda', async () => {
    const { auth, rice, base } = await setup();
    const first = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id, 100)).expect(201);
    const dietId = first.body.id;

    const conflict = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id, 300)).expect(409);
    expect(conflict.body.message).toMatch(/Confirme a substituição/);
    const unchanged = await http().get(`${base}/${dietId}`).set(auth).expect(200);
    expect(unchanged.body.currentVersion.meals[0].foods[0].quantity).toBe(100);

    const replaced = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id, 300, { replaceDraft: true })).expect(201);
    expect(replaced.body.versions).toHaveLength(1);
    expect(replaced.body.currentVersion.meals).toHaveLength(1);
    expect(replaced.body.currentVersion.meals[0].foods[0].quantity).toBe(300);
  });

  it('o profissional edita o rascunho (refeição e alimento) pelos endpoints existentes', async () => {
    const { auth, rice, base } = await setup();
    const created = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id)).expect(201);
    const dietId = created.body.id;
    const version = created.body.currentVersion;
    const meal = version.meals[0];
    await http().patch(`${base}/${dietId}/versions/${version.id}/meals/${meal.id}`).set(auth).send({ name: 'Almoço completo', time: '13:00' }).expect(200);
    await http().patch(`${base}/${dietId}/versions/${version.id}/meals/${meal.id}/foods/${meal.foods[0].id}`).set(auth).send({ quantity: 120 }).expect(200);
    await http().patch(`${base}/${dietId}/versions/${version.id}`).set(auth).send({ objective: 'Manutenção' }).expect(200);
    const after = await http().get(`${base}/${dietId}`).set(auth).expect(200);
    expect(after.body.currentVersion).toMatchObject({ objective: 'Manutenção' });
    expect(after.body.currentVersion.meals[0]).toMatchObject({ name: 'Almoço completo', time: '13:00' });
    expect(after.body.currentVersion.meals[0].foods[0]).toMatchObject({ quantity: 120, kcal: 156 });
  });

  it('excluir = arquivar: histórico preservado, cliente deixa de ver, nenhuma alteração possível', async () => {
    const { auth, client, rice, base } = await setup();
    const created = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id)).expect(201);
    const dietId = created.body.id;
    const versionId = created.body.currentVersion.id;
    await http().post(`${base}/${dietId}/versions/${versionId}/publish`).set(auth).expect(200);

    await http().patch(`${base}/${dietId}`).set(auth).send({ status: 'archived' }).expect(200);
    // Nada apagado: dieta, versão e refeições continuam no banco.
    expect(await prisma.diet.findUniqueOrThrow({ where: { id: dietId } })).toMatchObject({ status: 'archived' });
    expect(await prisma.meal.count({ where: { dietVersionId: versionId } })).toBe(1);

    await http().post(`${base}/${dietId}/versions`).set(auth).expect(409);
    await http().post(`${base}/${dietId}/versions/${versionId}/publish`).set(auth).expect(409);
    // A próxima proposta abre uma dieta NOVA (a arquivada não é reaproveitada).
    const next = await http().post(`${base}/from-proposal`).set(auth).send(proposal(rice.id)).expect(201);
    expect(next.body.id).not.toBe(dietId);
    expect(await prisma.dietVersion.count({ where: { diet: { clientId: client.id, status: 'active' }, status: 'published' } })).toBe(0);
  });

  it('alimento de outro profissional ou unidade inválida: recusado, nada criado', async () => {
    const { auth, client, base } = await setup();
    const other = await registerProfessional(app);
    const foreign = await createFood(app, other.accessToken, { name: `Privado ${Date.now()}`, scope: 'private' });
    await http().post(`${base}/from-proposal`).set(auth).send(proposal(foreign.id)).expect(404);
    await http()
      .post(`${base}/from-proposal`)
      .set(auth)
      .send({ meals: [{ name: 'ALMOÇO', foods: [{ foodId: foreign.id, quantity: 1, unit: 'concha' }] }] })
      .expect(400);
    expect(await prisma.diet.count({ where: { clientId: client.id } })).toBe(0);
  });
});
