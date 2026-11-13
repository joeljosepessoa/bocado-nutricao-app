import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createDiet, createFood, registerProfessional } from './helpers';

const prisma = new PrismaClient();

describe('Tela Alimentos (e2e)', () => {
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

  const get = (token: string, url: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get(url).query(query).set('Authorization', `Bearer ${token}`);

  it('busca sem acento, palavra por palavra, filtra por origem e grupo e não mostra alimento de outro profissional', async () => {
    const tag = Date.now();
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const mine = await createFood(app, me.accessToken, {
      name: `Tâmara, seca, recheada ${tag}`,
      scope: 'private',
      foodGroup: 'Frutas e derivados',
      sodiumMgPer100: 3,
      unitConversions: [{ unit: 'unit', gramsEquivalent: 8 }],
    });
    await createFood(app, other.accessToken, { name: `Tâmara do outro ${tag}`, scope: 'private' });

    const found = (await get(me.accessToken, '/foods/library', { search: `tamaras recheada ${tag}` }).expect(200)).body;
    expect(found.items.map((f: { id: string }) => f.id)).toEqual([mine.id]);
    expect(found.items[0]).toMatchObject({
      origin: 'mine',
      canEdit: true,
      foodGroup: 'Frutas e derivados',
      sodiumMgPer100: 3,
      householdMeasures: 1,
      tacoNumber: null,
    });
    expect(found.origins).toMatchObject({ all: 1, mine: 1, taco: 0 });
    expect(found.groups).toEqual([{ name: 'Frutas e derivados', count: 1 }]);

    const otherSees = (await get(other.accessToken, '/foods/library', { search: `tamara ${tag}` }).expect(200)).body;
    expect(otherSees.items.map((f: { id: string }) => f.id)).not.toContain(mine.id);

    expect((await get(me.accessToken, '/foods/library', { search: `${tag}`, origin: 'taco' }).expect(200)).body.total).toBe(0);
    expect((await get(me.accessToken, '/foods/library', { search: `${tag}`, group: 'Carnes e derivados' }).expect(200)).body.total).toBe(0);
  });

  it('alimento da TACO: ficha com nutrientes por seção, só leitura', async () => {
    const taco = await prisma.food.findFirst({ where: { source: 'taco4', kcalPer100: { not: null } }, orderBy: { sourceNumber: 'asc' } });
    if (!taco) return; // banco de teste sem a TACO importada
    const me = await registerProfessional(app);

    const details = (await get(me.accessToken, `/foods/${taco.id}/details`).expect(200)).body;
    expect(details).toMatchObject({ origin: 'taco', tacoNumber: taco.sourceNumber, canEdit: false, canDelete: false });
    const composition = details.sections.find((s: { title: string }) => s.title === 'Composição');
    expect(composition.rows.find((r: { key: string }) => r.key === 'energia_kcal')).toMatchObject({ unit: 'kcal', status: 'valor' });
    expect(details.sections.map((s: { title: string }) => s.title)).toContain('Minerais');

    const inLibrary = (await get(me.accessToken, '/foods/library', { search: taco.name, origin: 'taco' }).expect(200)).body;
    expect(inLibrary.items[0]).toMatchObject({ id: taco.id, origin: 'taco', canEdit: false });

    await request(app.getHttpServer()).patch(`/foods/${taco.id}`).set('Authorization', `Bearer ${me.accessToken}`).send({ name: 'Outro nome' }).expect(403);
    await request(app.getHttpServer()).delete(`/foods/${taco.id}`).set('Authorization', `Bearer ${me.accessToken}`).expect(403);
  });

  it('mostra onde o alimento é usado e só exclui o que não está em dieta', async () => {
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const { client } = await createClient(app, me.accessToken);
    const used = await createFood(app, me.accessToken, { name: 'Pasta de amendoim caseira', scope: 'private' });
    const unused = await createFood(app, me.accessToken, { name: 'Granola da casa', scope: 'private', unitConversions: [{ unit: 'tablespoon', gramsEquivalent: 12 }] });

    const diet = await createDiet(app, me.accessToken, client.id);
    const versionId = diet.currentVersion.id;
    const meal = await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals`)
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ name: 'Lanche' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${client.id}/diets/${diet.id}/versions/${versionId}/meals/${meal.body.id}/foods`)
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ foodId: used.id, quantity: 20, unit: 'g' })
      .expect(201);

    const usedDetails = (await get(me.accessToken, `/foods/${used.id}/details`).expect(200)).body;
    expect(usedDetails).toMatchObject({ origin: 'mine', canEdit: true, canDelete: false, usage: { patients: 1, dietItems: 1, templates: 0 } });
    expect(usedDetails.sections[0].rows.find((r: { key: string }) => r.key === 'energia_kcal')).toMatchObject({ value: 100, status: 'valor' });
    await request(app.getHttpServer()).delete(`/foods/${used.id}`).set('Authorization', `Bearer ${me.accessToken}`).expect(409);

    expect((await get(me.accessToken, `/foods/${unused.id}/details`).expect(200)).body).toMatchObject({ canDelete: true, unitConversions: [{ unit: 'tablespoon', gramsEquivalent: 12 }] });
    await request(app.getHttpServer()).delete(`/foods/${unused.id}`).set('Authorization', `Bearer ${other.accessToken}`).expect(404);
    await request(app.getHttpServer()).delete(`/foods/${unused.id}`).set('Authorization', `Bearer ${me.accessToken}`).expect(204);
    await get(me.accessToken, `/foods/${unused.id}`).expect(404);
  });

  it('peso por unidade: grava "1 fatia = 25 g" até em alimento da TACO e recalcula o rascunho', async () => {
    const tag = Date.now();
    const me = await registerProfessional(app);
    const other = await registerProfessional(app);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const mine = await createFood(app, me.accessToken, { name: `Pão caseiro ${tag}`, scope: 'private' });
    // Linha "da TACO" própria do teste (não mexe na TACO importada no banco de teste).
    const taco = await prisma.food.create({
      data: {
        name: `Pão, trigo, forma, integral ${tag}`,
        scope: 'global',
        baseUnit: 'g',
        kcalPer100: 250,
        proteinGPer100: 9,
        carbGPer100: 50,
        fatGPer100: 3,
        source: 'taco4',
        sourceKey: `taco4:teste-${tag}`,
        approvedAt: new Date(),
        createdByProfessionalId: mine.createdByProfessionalId,
      },
    });

    const { client } = await createClient(app, me.accessToken);
    const diet = await createDiet(app, me.accessToken, client.id);
    const base = `/clients/${client.id}/diets/${diet.id}/versions/${diet.currentVersion.id}`;
    const meal = (await request(app.getHttpServer()).post(`${base}/meals`).set(auth(me.accessToken)).send({ name: 'Café' }).expect(201)).body;
    const item = (
      await request(app.getHttpServer()).post(`${base}/meals/${meal.id}/foods`).set(auth(me.accessToken)).send({ foodId: taco.id, quantity: 2, unit: 'slice' }).expect(201)
    ).body;
    expect(item.kcal).toBeNull();

    const saved = (
      await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/slice`).set(auth(me.accessToken)).send({ gramsEquivalent: 25 }).expect(200)
    ).body;
    expect(saved).toMatchObject({ unit: 'slice', gramsEquivalent: 25, recalculatedItems: 1 });
    expect(await prisma.mealFood.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ gramsEquivalent: 50, kcal: 125, proteinG: 4.5, carbG: 25, fatG: 1.5 });
    expect((await get(me.accessToken, `/foods/${taco.id}/details`).expect(200)).body.unitConversions).toEqual([{ unit: 'slice', gramsEquivalent: 25 }]);

    // Corrigir o peso substitui o anterior e recalcula de novo.
    await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/slice`).set(auth(me.accessToken)).send({ gramsEquivalent: 30 }).expect(200);
    expect((await prisma.mealFood.findUniqueOrThrow({ where: { id: item.id } })).kcal).toBe(150);

    // O rascunho de outro profissional não é tocado; ele também pode informar peso na TACO.
    await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/unit`).set(auth(other.accessToken)).send({ gramsEquivalent: 50 }).expect(200);
    // Alimento particular de outro profissional: invisível.
    await request(app.getHttpServer()).put(`/foods/${mine.id}/unit-conversions/slice`).set(auth(other.accessToken)).send({ gramsEquivalent: 20 }).expect(404);
    // Unidade base, unidade inexistente e peso inválido.
    await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/g`).set(auth(me.accessToken)).send({ gramsEquivalent: 1 }).expect(400);
    await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/banana`).set(auth(me.accessToken)).send({ gramsEquivalent: 20 }).expect(400);
    await request(app.getHttpServer()).put(`/foods/${taco.id}/unit-conversions/slice`).set(auth(me.accessToken)).send({ gramsEquivalent: 0 }).expect(400);
  });
});
