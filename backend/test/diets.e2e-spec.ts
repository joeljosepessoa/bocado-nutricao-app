import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createDiet, createFood, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

async function addMealWithFood(
  app: INestApplication,
  accessToken: string,
  clientId: string,
  dietId: string,
  versionId: string,
  foodId: string,
  quantity = 100,
  unit = 'g',
) {
  const meal = await request(app.getHttpServer())
    .post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Almoço' })
    .expect(201);

  const mealFood = await request(app.getHttpServer())
    .post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${meal.body.id}/foods`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ foodId, quantity, unit })
    .expect(201);

  return { meal: meal.body, mealFood: mealFood.body };
}

describe('Dietas (e2e)', () => {
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

  // 1. Criação
  it('cria dieta com primeira versão em rascunho (v1)', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const diet = await createDiet(app, professional.accessToken, client.id, { notes: 'Início do acompanhamento' });

    expect(diet.status).toBe('active');
    expect(diet.currentVersion.versionNumber).toBe(1);
    expect(diet.currentVersion.status).toBe('draft');
    expect(diet.currentVersion.notes).toBe('Início do acompanhamento');
  });

  // 2. Edição
  it('edita rascunho livremente; edição de versão publicada retorna 409', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ objective: 'Emagrecimento' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ objective: 'Tentativa indevida' })
      .expect(409);
  });

  // 3. Publicação
  it('publica um rascunho; publicar de novo a mesma versão retorna 409', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    const published = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(published.body.status).toBe('published');
    expect(published.body.publishedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);
  });

  // 4. Versionamento
  it('nova versão clona fielmente a publicada; a versão antiga permanece intacta e vira superseded', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, { kcalPer100: 200 });
    const diet = await createDiet(app, professional.accessToken, client.id, { notes: 'v1' });
    const v1Id = diet.currentVersion.id;
    await addMealWithFood(app, professional.accessToken, client.id, diet.id, v1Id, food.id, 100);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${v1Id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const v2 = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(201);
    expect(v2.body.versionNumber).toBe(2);
    expect(v2.body.meals).toHaveLength(1);
    expect(v2.body.meals[0].foods).toHaveLength(1);
    expect(v2.body.dayTotals.kcal).toBe(200);

    // segundo draft enquanto o primeiro ainda existe -> 409
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(409);

    // editar o clone não afeta a versão publicada original
    await request(app.getHttpServer())
      .patch(`/clients/${client.id}/diets/${diet.id}/versions/${v2.body.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ notes: 'v2 editada' })
      .expect(200);

    const v1After = await request(app.getHttpServer())
      .get(`/clients/${client.id}/diets/${diet.id}/versions/${v1Id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(v1After.body.notes).toBe('v1');
    expect(v1After.body.meals).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${v2.body.id}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const v1Final = await request(app.getHttpServer())
      .get(`/clients/${client.id}/diets/${diet.id}/versions/${v1Id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);
    expect(v1Final.body.status).toBe('superseded');
  });

  // 5. Cálculo nutricional
  it('calcula macros corretamente para quantidade em gramas e em unidade convertida', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, {
      kcalPer100: 130,
      proteinGPer100: 2.7,
      carbGPer100: 28.2,
      fatGPer100: 0.3,
      fiberGPer100: 0.4,
      unitConversions: [{ unit: 'tablespoon', gramsEquivalent: 20 }],
    });
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    const { mealFood: grams } = await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id, 150, 'g');
    expect(grams.kcal).toBe(195);
    expect(grams.proteinG).toBeCloseTo(4.1, 1);

    const meal2 = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Lanche' })
      .expect(201);
    const tbsp = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals/${meal2.body.id}/foods`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ foodId: food.id, quantity: 2, unit: 'tablespoon' })
      .expect(201);
    expect(tbsp.body.gramsEquivalent).toBe(40);
    expect(tbsp.body.kcal).toBe(52);
  });

  it('unidade sem conversão confiável não entra automaticamente no cálculo', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, { kcalPer100: 130 });
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    const { mealFood } = await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id, 1, 'cup');
    expect(mealFood.kcal).toBeNull();
    expect(mealFood.hasReliableConversion).toBe(false);
  });

  // 6 e 7. Totais por refeição e por dia
  it('totais por refeição e por dia somam corretamente, com percentuais coerentes', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    // Atwater: 10g proteína×4 + 10g carbo×4 + 2g gordura×9 = 98kcal — kcal
    // declarado consistente com os macros, para o percentual fechar em ~100%.
    const food = await createFood(app, professional.accessToken, {
      kcalPer100: 98,
      proteinGPer100: 10,
      carbGPer100: 10,
      fatGPer100: 2,
    });
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id, 100);
    await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id, 200);

    const detail = await request(app.getHttpServer())
      .get(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    expect(detail.body.meals).toHaveLength(2);
    expect(detail.body.meals[0].totals.kcal).toBe(98);
    expect(detail.body.meals[1].totals.kcal).toBe(196);
    expect(detail.body.dayTotals.kcal).toBe(294);

    const { proteinPercent, carbPercent, fatPercent } = detail.body.percentageDistribution;
    expect(proteinPercent + carbPercent + fatPercent).toBeCloseTo(100, 0);
  });

  // 9. Isolamento entre profissionais
  it('profissional B não acessa dieta de cliente do profissional A', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const { client } = await createClient(app, professionalA.accessToken);
    const diet = await createDiet(app, professionalA.accessToken, client.id);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/diets/${diet.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);
  });

  // 10. Isolamento entre clientes (role=client bloqueado inteiramente)
  it('cliente autenticado recebe 403 em todas as rotas de dieta', async () => {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const diet = await createDiet(app, professional.accessToken, client.id);
    const clientSession = await login(app, client.user.email, temporaryPassword);
    const auth = { Authorization: `Bearer ${clientSession.accessToken}` };

    await request(app.getHttpServer()).get(`/clients/${client.id}/diets`).set(auth).expect(403);
    await request(app.getHttpServer()).get(`/clients/${client.id}/diets/${diet.id}`).set(auth).expect(403);
    await request(app.getHttpServer()).post(`/clients/${client.id}/diets`).set(auth).send({}).expect(403);
  });

  // 12. Auditoria
  it('registra ações de auditoria sem armazenar valores nutricionais', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, { kcalPer100: 300 });
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;
    await addMealWithFood(app, professional.accessToken, client.id, diet.id, versionId, food.id, 100);

    await request(app.getHttpServer())
      .get(`/clients/${client.id}/diets/${diet.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    const logs = await prisma.dietAuditLog.findMany({ where: { dietId: diet.id } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['created', 'meal_added', 'food_added', 'read']));
    for (const log of logs) {
      const keys = Object.keys(log);
      expect(keys).not.toContain('kcal');
      expect(keys).not.toContain('quantity');
      expect(keys).not.toContain('notes');
    }
  });

  // 13. Validações
  it('rejeita quantidade negativa e foodId inexistente', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken);
    const diet = await createDiet(app, professional.accessToken, client.id);
    const versionId = diet.currentVersion.id;

    const meal = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Almoço' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals/${meal.body.id}/foods`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ foodId: food.id, quantity: -100, unit: 'g' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals/${meal.body.id}/foods`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ foodId: '00000000-0000-0000-0000-000000000000', quantity: 100, unit: 'g' })
      .expect(404);
  });
});
