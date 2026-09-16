import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAdmin, createClient, createDiet, createFood, registerProfessional } from './helpers';

describe('Catálogo de alimentos (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria alimento global com conversão de unidade', async () => {
    const professional = await registerProfessional(app);
    const food = await createFood(app, professional.accessToken, {
      name: 'Aveia em flocos',
      unitConversions: [{ unit: 'tablespoon', gramsEquivalent: 15 }],
    });

    expect(food.scope).toBe('global');
    expect(food.unitConversions[0]).toMatchObject({ unit: 'tablespoon', gramsEquivalent: 15 });
  });

  it('alimento privado não é visível para outro profissional', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const privateFood = await createFood(app, professionalA.accessToken, { name: 'Receita da vovó', scope: 'private' });

    await request(app.getHttpServer())
      .get(`/foods/${privateFood.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/foods')
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);
    expect(listB.body.map((f: { id: string }) => f.id)).not.toContain(privateFood.id);
  });

  it('dono consegue ver e editar seu próprio alimento privado', async () => {
    const professional = await registerProfessional(app);
    const privateFood = await createFood(app, professional.accessToken, { name: 'Vitamina especial', scope: 'private' });

    await request(app.getHttpServer())
      .get(`/foods/${privateFood.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/foods/${privateFood.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ kcalPer100: 150 })
      .expect(200);
  });

  it('alimento global recém-criado fica pendente (Fase 15) — só visível a outro profissional depois de aprovado; só o criador pode editar', async () => {
    const professionalA = await registerProfessional(app);
    const professionalB = await registerProfessional(app);
    const admin = await createAdmin(app);
    const globalFood = await createFood(app, professionalA.accessToken, { name: 'Frango grelhado' });

    // pendente de moderação: o criador vê, o outro profissional não
    await request(app.getHttpServer())
      .get(`/foods/${globalFood.id}`)
      .set('Authorization', `Bearer ${professionalA.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/foods/${globalFood.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/admin/moderation/foods/${globalFood.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    // aprovado: agora visível a todos, mas só o criador pode editar
    await request(app.getHttpServer())
      .get(`/foods/${globalFood.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/foods/${globalFood.id}`)
      .set('Authorization', `Bearer ${professionalB.accessToken}`)
      .send({ kcalPer100: 999 })
      .expect(403);
  });

  it('bloqueia edição nutricional de alimento já usado em dieta publicada, mas permite editar o nome', async () => {
    const professional = await registerProfessional(app);
    const { client } = await createClient(app, professional.accessToken);
    const food = await createFood(app, professional.accessToken, { name: 'Batata inglesa' });
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
      .send({ foodId: food.id, quantity: 100, unit: 'g' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/foods/${food.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ kcalPer100: 500 })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/foods/${food.id}`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ name: 'Batata inglesa cozida' })
      .expect(200);
  });

  it('substituição calcula equivalência nutricional real, não apenas declara', async () => {
    const professional = await registerProfessional(app);
    const original = await createFood(app, professional.accessToken, {
      name: 'Arroz',
      kcalPer100: 130,
      proteinGPer100: 2.7,
      carbGPer100: 28.2,
      fatGPer100: 0.3,
    });
    const substitute = await createFood(app, professional.accessToken, {
      name: 'Batata doce',
      kcalPer100: 80,
      proteinGPer100: 1.6,
      carbGPer100: 18.4,
      fatGPer100: 0.1,
    });

    const res = await request(app.getHttpServer())
      .post(`/foods/${original.id}/substitutions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ substituteFoodId: substitute.id, substituteQuantity: 130, substituteUnit: 'g' })
      .expect(201);

    expect(res.body.substituteKcal).toBeCloseTo(104, 1);
    expect(res.body.substituteProteinG).toBeCloseTo(2.1, 1);
  });

  it('substituição com unidade sem conversão confiável é rejeitada', async () => {
    const professional = await registerProfessional(app);
    const original = await createFood(app, professional.accessToken);
    const substitute = await createFood(app, professional.accessToken);

    await request(app.getHttpServer())
      .post(`/foods/${original.id}/substitutions`)
      .set('Authorization', `Bearer ${professional.accessToken}`)
      .send({ substituteFoodId: substitute.id, substituteQuantity: 1, substituteUnit: 'cup' })
      .expect(400);
  });
});
