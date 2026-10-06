import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createFood, registerProfessional } from './helpers';

const prisma = new PrismaClient();

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Estrutura nova da dieta — dias, opções, alternativas, suplementos (e2e)', () => {
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

  /** Monta a dieta do exemplo (dia de treino + dia de descanso) só com endpoints do backend. */
  async function setup() {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const tag = Date.now();
    // 100 g → kcal = kcalPer100 (cálculo do backend).
    const food = (name: string, kcalPer100: number) => createFood(app, professional.accessToken, { name: `${name} ${tag}`, kcalPer100, scope: 'private' });
    const [op1, op2a, op2b, op3, arroz, batata, frango, carne, feijao, iogurte, castanha] = await Promise.all([
      food('Opção um', 350),
      food('Aveia', 200),
      food('Whey', 120),
      food('Pão', 340),
      food('Arroz', 130),
      food('Batata', 90),
      food('Frango', 200),
      food('Carne', 250),
      food('Feijão', 70),
      food('Iogurte', 200),
      food('Castanha', 400),
    ]);

    const diet = (await http().post(`/clients/${client.id}/diets`).set(auth).send({}).expect(201)).body;
    const v = diet.currentVersion.id;
    const base = `/clients/${client.id}/diets/${diet.id}/versions/${v}`;
    const detail = async () => (await http().get(base).set(auth).expect(200)).body;

    // Dia único criado junto da dieta vira "Dia de treino"; segundo dia "Dia de descanso".
    const initial = await detail();
    expect(initial.days).toHaveLength(1);
    const treino = initial.days[0].id;
    await http().patch(`${base}/days/${treino}`).set(auth).send({ label: 'Dia de treino', kind: 'training', usageNotes: 'Usar nos 5 dias de musculação.' }).expect(200);
    const descanso = (await http().post(`${base}/days`).set(auth).send({ label: 'Dia de descanso', kind: 'rest' }).expect(201)).body.id;

    const addFood = (mealId: string, groupId: string, choiceId: string, body: Record<string, unknown>) =>
      http().post(`${base}/meals/${mealId}/groups/${groupId}/choices/${choiceId}/foods`).set(auth).send(body);
    const choice = async (mealId: string, groupId: string, label: string) =>
      (await http().post(`${base}/meals/${mealId}/groups/${groupId}/choices`).set(auth).send({ label }).expect(201)).body.id as string;
    const group = async (mealId: string, kind: string, label?: string) =>
      (await http().post(`${base}/meals/${mealId}/groups`).set(auth).send({ kind, label }).expect(201)).body.id as string;

    // CAFÉ: 3 opções completas (350 / 200+120 / 340).
    const cafe = (await http().post(`${base}/meals`).set(auth).send({ name: 'Café da manhã', dietDayId: treino }).expect(201)).body.id;
    const opcoes = await group(cafe, 'meal_options', 'Escolha 1 opção');
    const o1 = await choice(cafe, opcoes, 'Opção 1');
    const o2 = await choice(cafe, opcoes, 'Opção 2');
    const o3 = await choice(cafe, opcoes, 'Opção 3');
    await addFood(cafe, opcoes, o1, { foodId: op1.id, quantity: 100, unit: 'g' }).expect(201);
    await addFood(cafe, opcoes, o2, { foodId: op2a.id, quantity: 100, unit: 'g' }).expect(201);
    await addFood(cafe, opcoes, o2, { foodId: op2b.id, quantity: 100, unit: 'g' }).expect(201);
    await addFood(cafe, opcoes, o3, { foodId: op3.id, quantity: 100, unit: 'g' }).expect(201);

    // ALMOÇO: Carboidrato (130/90) e Proteína (200/250) escolher 1 + fixo (feijão 70 + salada à vontade, fora do catálogo).
    const almoco = (await http().post(`${base}/meals`).set(auth).send({ name: 'Almoço', dietDayId: treino }).expect(201)).body.id;
    const carbo = await group(almoco, 'alternatives', 'Carboidrato');
    await addFood(almoco, carbo, await choice(almoco, carbo, 'Arroz'), { foodId: arroz.id, quantity: 100, unit: 'g' }).expect(201);
    await addFood(almoco, carbo, await choice(almoco, carbo, 'Batata'), { foodId: batata.id, quantity: 100, unit: 'g' }).expect(201);
    const prot = await group(almoco, 'alternatives', 'Proteína');
    await addFood(almoco, prot, await choice(almoco, prot, 'Frango'), { foodId: frango.id, quantity: 100, unit: 'g' }).expect(201);
    await addFood(almoco, prot, await choice(almoco, prot, 'Carne'), { foodId: carne.id, quantity: 100, unit: 'g' }).expect(201);
    // Endpoint ANTIGO de incluir alimento → vai para o grupo fixo da refeição.
    await http().post(`${base}/meals/${almoco}/foods`).set(auth).send({ foodId: feijao.id, quantity: 100, unit: 'g' }).expect(201);
    const almocoFixed = (await detail()).days[0].meals.find((m: any) => m.id === almoco).groups.find((g: any) => g.kind === 'fixed');
    await addFood(almoco, almocoFixed.id, almocoFixed.choices[0].id, { customFoodName: 'Salada de folhas', isFreeQuantity: true }).expect(201);

    // CEIA do descanso: iogurte 200 + castanhas "10 a 15 g" (40 a 60 kcal).
    const ceia = (await http().post(`${base}/meals`).set(auth).send({ name: 'Ceia', dietDayId: descanso }).expect(201)).body.id;
    await http().post(`${base}/meals/${ceia}/foods`).set(auth).send({ foodId: iogurte.id, quantity: 100, unit: 'g' }).expect(201);
    const ceiaFixed = (await detail()).days[1].meals[0].groups[0];
    await addFood(ceia, ceiaFixed.id, ceiaFixed.choices[0].id, { foodId: castanha.id, quantity: 10, quantityMax: 15, unit: 'g' }).expect(201);

    // SUPLEMENTAÇÃO e ORIENTAÇÕES.
    await http().post(`${base}/supplements`).set(auth).send({ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: 'antes do café da manhã' }).expect(201);
    await http().post(`${base}/supplements`).set(auth).send({ name: 'Ômega-3', quantity: 1, unitText: 'cápsula', timing: 'no almoço e no jantar' }).expect(201);
    await http().patch(base).set(auth).send({ patientGuidelines: 'Água: no mínimo 2,5 litros por dia.', notes: 'Nota interna' }).expect(200);

    return { professional, auth, client, temporaryPassword, diet, v, base, detail, treino, descanso, cafe, opcoes, almoco, carbo, almocoFixed, ceia, addFood, foods: { feijao } };
  }

  it('faixas: opções e alternativas nunca somadas; dias separados; total parcial com item à vontade', async () => {
    const { detail } = await setup();
    const d = await detail();
    const [treino, descanso] = d.days;
    expect([treino.label, treino.kind, descanso.label, descanso.kind]).toEqual(['Dia de treino', 'training', 'Dia de descanso', 'rest']);

    const cafe = treino.meals.find((m: any) => m.name === 'Café da manhã');
    expect(cafe.groups).toHaveLength(1);
    expect(cafe.groups[0].kind).toBe('meal_options');
    expect(cafe.groups[0].choices.map((c: any) => [c.label, c.nutrition.min.kcal])).toEqual([
      ['Opção 1', 350],
      ['Opção 2', 320],
      ['Opção 3', 340],
    ]);
    expect([cafe.nutrition.min.kcal, cafe.nutrition.max.kcal]).toEqual([320, 350]);

    const almoco = treino.meals.find((m: any) => m.name === 'Almoço');
    expect(almoco.groups.map((g: any) => [g.kind, g.label, g.nutrition.min.kcal, g.nutrition.max.kcal])).toEqual([
      ['fixed', null, 70, 70],
      ['alternatives', 'Carboidrato', 90, 130],
      ['alternatives', 'Proteína', 200, 250],
    ]);
    expect(almoco.nutrition).toMatchObject({ min: { kcal: 360 }, max: { kcal: 450 }, partial: true });
    const salada = almoco.groups[0].choices[0].foods.find((f: any) => f.customFoodName === 'Salada de folhas');
    expect(salada).toMatchObject({ foodId: null, isFreeQuantity: true, quantity: null, kcal: null });

    expect(treino.nutrition).toMatchObject({ min: { kcal: 680 }, max: { kcal: 800 }, partial: true });
    expect(descanso.nutrition).toMatchObject({ min: { kcal: 240 }, max: { kcal: 260 }, partial: false });

    // Formato antigo: totais que somariam alternativas vêm null; o do dia também (há 2 dias).
    expect(d.dayTotals).toBeNull();
    expect(d.meals.find((m: any) => m.name === 'Café da manhã').totals).toBeNull();
    expect(d.meals.find((m: any) => m.name === 'Ceia').totals.kcal).toBe(240);

    expect(d.patientGuidelines).toBe('Água: no mínimo 2,5 litros por dia.');
    expect(d.supplements.map((s: any) => [s.name, s.quantity, s.quantityMax, s.unitText, s.timing])).toEqual([
      ['Creatina', 3, 5, 'g', 'antes do café da manhã'],
      ['Ômega-3', 1, null, 'cápsula', 'no almoço e no jantar'],
    ]);
  });

  it('regras: opções completas são o único grupo; grupo fixo tem 1 escolha; item precisa de catálogo OU nome; à vontade sem quantidade', async () => {
    const { auth, base, cafe, almoco, almocoFixed, addFood } = await setup();
    await http().post(`${base}/meals/${cafe}/groups`).set(auth).send({ kind: 'alternatives', label: 'X' }).expect(409);
    await http().post(`${base}/meals/${almoco}/groups`).set(auth).send({ kind: 'fixed' }).expect(409);
    await http().post(`${base}/meals/${almoco}/groups`).set(auth).send({ kind: 'meal_options' }).expect(409);
    await http().post(`${base}/meals/${almoco}/groups/${almocoFixed.id}/choices`).set(auth).send({ label: 'Outra' }).expect(409);
    await http().delete(`${base}/meals/${almoco}/groups/${almocoFixed.id}/choices/${almocoFixed.choices[0].id}`).set(auth).expect(409);
    // Endpoint antigo não sabe em qual opção colocar → recusa em refeição de opções.
    const anyFood = (await http().get('/foods').set(auth).expect(200)).body[0];
    await http().post(`${base}/meals/${cafe}/foods`).set(auth).send({ foodId: anyFood.id, quantity: 1, unit: 'g' }).expect(409);

    const fixedChoice = almocoFixed.choices[0].id;
    await addFood(almoco, almocoFixed.id, fixedChoice, { foodId: anyFood.id, customFoodName: 'Duplo' }).expect(400);
    await addFood(almoco, almocoFixed.id, fixedChoice, { quantity: 10, unit: 'g' }).expect(400);
    await addFood(almoco, almocoFixed.id, fixedChoice, { customFoodName: 'Legumes', isFreeQuantity: true, quantity: 100 }).expect(400);
    await addFood(almoco, almocoFixed.id, fixedChoice, { customFoodName: 'Legumes', quantity: 100, quantityMax: 50, unit: 'g' }).expect(400);
    // Item livre com quantidade é aceito, mas sem cálculo (nunca valor inventado).
    const legumes = await addFood(almoco, almocoFixed.id, fixedChoice, { customFoodName: 'Legumes', quantity: 100, unit: 'g' }).expect(201);
    expect(legumes.body).toMatchObject({ foodId: null, kcal: null, hasReliableConversion: false });
  });

  it('publicar exige estrutura completa; o app recebe dias/opções/blocos + formato antigo legível; nada interno vaza', async () => {
    const { auth, client, temporaryPassword, diet, v, base, treino } = await setup();
    const lanche = (await http().post(`${base}/meals`).set(auth).send({ name: 'Lanche', dietDayId: treino }).expect(201)).body.id;
    const vazio = (await http().post(`${base}/meals/${lanche}/groups`).set(auth).send({ kind: 'alternatives', label: 'Fruta' }).expect(201)).body.id;
    const blocked = await http().post(`/clients/${client.id}/diets/${diet.id}/versions/${v}/publish`).set(auth).expect(409);
    expect(blocked.body.message).toMatch(/Corrija a estrutura antes de publicar: .*Fruta.*sem nenhuma opção/);
    await http().delete(`${base}/meals/${lanche}/groups/${vazio}`).set(auth).expect(204);
    await http().delete(`${base}/meals/${lanche}`).set(auth).expect(204);
    await http().post(`/clients/${client.id}/diets/${diet.id}/versions/${v}/publish`).set(auth).expect(200);

    const login = await http().post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const mine = (await http().get('/client/diet').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200)).body.diet;
    expect(mine.days.map((d: any) => d.label)).toEqual(['Dia de treino', 'Dia de descanso']);
    const cafe = mine.days[0].meals.find((m: any) => m.name === 'Café da manhã');
    expect(cafe.groups[0]).toMatchObject({ kind: 'meal_options', label: 'Escolha 1 opção' });
    expect(cafe.groups[0].choices.map((c: any) => c.label)).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
    const almoco = mine.days[0].meals.find((m: any) => m.name === 'Almoço');
    expect(almoco.groups.find((g: any) => g.label === 'Carboidrato').choices.map((c: any) => c.label)).toEqual(['Arroz', 'Batata']);
    expect(almoco.groups[0].choices[0].foods.find((f: any) => f.isCustom)).toMatchObject({ foodName: 'Salada de folhas', isFreeQuantity: true });
    expect(mine.supplements.map((s: any) => s.name)).toEqual(['Creatina', 'Ômega-3']);
    expect(mine.patientGuidelines).toBe('Água: no mínimo 2,5 litros por dia.');

    // Formato antigo (APK instalado): cada opção vira uma refeição; bloco com prefixo; nunca "coma tudo".
    const legacyNames = mine.meals.map((m: any) => m.name);
    expect(legacyNames).toEqual(
      expect.arrayContaining([
        'Dia de treino · Café da manhã — Opção 1 (escolha 1 opção)',
        'Dia de treino · Café da manhã — Opção 3 (escolha 1 opção)',
        'Dia de treino · Almoço',
        'Dia de descanso · Ceia',
      ]),
    );
    const legacyAlmoco = mine.meals.find((m: any) => m.name === 'Dia de treino · Almoço');
    expect(legacyAlmoco.foods.map((f: any) => f.foodName)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Carboidrato \(escolha 1\): Arroz/), 'Salada de folhas (à vontade)']),
    );
    expect(JSON.stringify(mine)).not.toContain('Nota interna');
  });

  it('"Editar" (nova versão) copia a árvore inteira, suplementos e orientações; a publicada fica intacta', async () => {
    const { auth, client, diet, v, detail } = await setup();
    const original = await detail();
    await http().post(`/clients/${client.id}/diets/${diet.id}/versions/${v}/publish`).set(auth).expect(200);
    const copy = (await http().post(`/clients/${client.id}/diets/${diet.id}/versions`).set(auth).expect(201)).body;

    const shape = (d: any) =>
      d.days.map((day: any) => [
        day.label,
        day.kind,
        day.usageNotes,
        day.meals.map((m: any) => [
          m.name,
          m.groups.map((g: any) => [g.kind, g.label, g.choices.map((c: any) => [c.label, c.foods.map((f: any) => [f.foodId, f.customFoodName, f.quantity, f.quantityMax, f.isFreeQuantity, f.kcal])])]),
        ]),
      ]);
    expect(copy.versionNumber).toBe(2);
    expect(shape(copy)).toEqual(shape(original));
    expect(copy.supplements.map((s: any) => s.name)).toEqual(['Creatina', 'Ômega-3']);
    expect(copy.patientGuidelines).toBe(original.patientGuidelines);
    // Ids novos (cópia), nunca os mesmos registros.
    expect(copy.days[0].id).not.toBe(original.days[0].id);

    const published = await detail();
    expect(published.status).toBe('published');
    expect(shape(published)).toEqual(shape(original));
  });

  it('editar item: "à vontade" tira o item da soma; faixa nova exige mínimo menor', async () => {
    const { auth, base, detail, almoco } = await setup();
    const d = await detail();
    const feijao = d.days[0].meals.find((m: any) => m.id === almoco).groups[0].choices[0].foods.find((f: any) => f.foodId);
    await http().patch(`${base}/meals/${almoco}/foods/${feijao.id}`).set(auth).send({ quantityMax: 50 }).expect(400);
    const free = await http().patch(`${base}/meals/${almoco}/foods/${feijao.id}`).set(auth).send({ isFreeQuantity: true }).expect(200);
    expect(free.body).toMatchObject({ isFreeQuantity: true, quantity: null, kcal: null });
    const after = (await detail()).days[0].meals.find((m: any) => m.id === almoco);
    expect(after.groups[0].nutrition).toMatchObject({ min: { kcal: 0 }, partial: true });
  });
});
