import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { createClient, createFood, registerProfessional } from './helpers';

const prisma = new PrismaClient();

/** O MESMO bloco SQL de conversão da migration (entre BACKFILL BEGIN/END). */
function backfillStatements(): string[] {
  const dir = join(__dirname, '../../database/migrations');
  const folder = readdirSync(dir).find((name) => name.endsWith('_diet_days_groups_choices_supplements'))!;
  const sql = readFileSync(join(dir, folder, 'migration.sql'), 'utf-8');
  const afterMarker = sql.split('-- BACKFILL BEGIN')[1];
  const block = afterMarker.slice(afterMarker.indexOf('\n')).split('-- BACKFILL END')[0];
  return block
    .split(/;\s*\n/)
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

async function runBackfill() {
  for (const statement of backfillStatements()) await prisma.$executeRawUnsafe(statement);
}

const SNAPSHOT_FIELDS = ['id', 'mealId', 'foodId', 'order', 'quantity', 'unit', 'gramsEquivalent', 'kcal', 'proteinG', 'carbG', 'fatG', 'fiberG', 'notes'] as const;
const snapshotOf = (rows: Record<string, unknown>[]) => rows.map((row) => Object.fromEntries(SNAPSHOT_FIELDS.map((k) => [k, row[k]])));

describe('Migration P1 — conversão das dietas existentes (e2e, banco real)', () => {
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

  /** Dieta no formato ANTIGO (como está hoje em produção): sem dia, grupo nem escolha. */
  async function legacyDiet() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const rice = await createFood(app, professional.accessToken, { name: `Arroz ${Date.now()}`, kcalPer100: 130, scope: 'private' });
    const chicken = await createFood(app, professional.accessToken, { name: `Frango ${Date.now()}`, kcalPer100: 165, scope: 'private' });
    const diet = await prisma.diet.create({ data: { clientId: client.id, professionalId: professional.user.id } });
    const make = async (versionNumber: number, status: 'draft' | 'published' | 'superseded', kcalFactor: number) => {
      const version = await prisma.dietVersion.create({
        data: {
          dietId: diet.id,
          versionNumber,
          status,
          createdByProfessionalId: professional.user.id,
          publishedAt: status === 'draft' ? null : new Date(2026, 0, versionNumber),
          supersededAt: status === 'superseded' ? new Date(2026, 1, versionNumber) : null,
        },
      });
      for (const [order, name] of ['Café da manhã', 'Almoço', 'Jantar'].entries()) {
        const meal = await prisma.meal.create({ data: { dietVersionId: version.id, name, order, time: `0${order + 7}:00`, notes: order === 1 ? 'Mastigar devagar' : null } });
        await prisma.mealFood.create({
          data: { mealId: meal.id, foodId: rice.id, order: 0, quantity: 150, unit: 'g', gramsEquivalent: 150, kcal: 195 * kcalFactor, proteinG: 4.1, carbG: 42.3, fatG: 0.5, fiberG: 1.2 },
        });
        await prisma.mealFood.create({
          data: { mealId: meal.id, foodId: chicken.id, order: 1, quantity: 100, unit: 'g', gramsEquivalent: 100, kcal: 165, proteinG: 31, carbG: 0, fatG: 3.6, fiberG: null, notes: 'grelhado' },
        });
      }
      return version;
    };
    const superseded = await make(1, 'superseded', 1);
    const published = await make(2, 'published', 1.1);
    const draft = await make(3, 'draft', 1.2);
    return { professional, client, temporaryPassword, diet, versions: [superseded, published, draft] };
  }

  it('cada versão ganha 1 dia único; cada refeição, 1 grupo fixo com 1 escolha; cada item é ligado — sem mudar nenhum valor', async () => {
    const { diet, versions } = await legacyDiet();
    const versionIds = versions.map((v) => v.id);
    const before = snapshotOf(await prisma.mealFood.findMany({ where: { meal: { dietVersionId: { in: versionIds } } }, orderBy: { id: 'asc' } }));
    const versionsBefore = await prisma.dietVersion.findMany({ where: { dietId: diet.id }, orderBy: { versionNumber: 'asc' } });

    await runBackfill();

    for (const versionId of versionIds) {
      const days = await prisma.dietDay.findMany({ where: { dietVersionId: versionId } });
      expect(days).toHaveLength(1);
      expect(days[0]).toMatchObject({ label: null, kind: 'other', order: 0 });
      const meals = await prisma.meal.findMany({ where: { dietVersionId: versionId }, include: { groups: { include: { choices: true } }, foods: true } });
      expect(meals).toHaveLength(3);
      for (const meal of meals) {
        expect(meal.dietDayId).toBe(days[0].id);
        expect(meal.groups).toHaveLength(1);
        expect(meal.groups[0].kind).toBe('fixed');
        expect(meal.groups[0].choices).toHaveLength(1);
        expect(meal.foods.every((f) => f.mealChoiceId === meal.groups[0].choices[0].id)).toBe(true);
      }
    }

    // kcal, macros, quantidades, unidades, alimentos e ordem intactos; status/datas das versões intactos.
    const after = snapshotOf(await prisma.mealFood.findMany({ where: { meal: { dietVersionId: { in: versionIds } } }, orderBy: { id: 'asc' } }));
    expect(after).toEqual(before);
    const versionsAfter = await prisma.dietVersion.findMany({ where: { dietId: diet.id }, orderBy: { versionNumber: 'asc' } });
    expect(versionsAfter.map((v) => [v.status, v.publishedAt, v.supersededAt])).toEqual(versionsBefore.map((v) => [v.status, v.publishedAt, v.supersededAt]));
  });

  it('é idempotente: rodar de novo não cria nada', async () => {
    const { diet } = await legacyDiet();
    await runBackfill();
    // Contagem só desta dieta — outras suítes rodam em paralelo no mesmo banco.
    const count = async () => [
      await prisma.dietDay.count({ where: { dietVersion: { dietId: diet.id } } }),
      await prisma.mealGroup.count({ where: { meal: { dietVersion: { dietId: diet.id } } } }),
      await prisma.mealChoice.count({ where: { group: { meal: { dietVersion: { dietId: diet.id } } } } }),
    ];
    const first = await count();
    await runBackfill();
    expect(await count()).toEqual(first);
  });

  it('depois da conversão, painel e app enxergam a dieta exatamente como antes', async () => {
    const { professional, client, temporaryPassword, diet, versions } = await legacyDiet();
    await runBackfill();
    const auth = { Authorization: `Bearer ${professional.accessToken}` };

    const published = await request(app.getHttpServer()).get(`/clients/${client.id}/diets/${diet.id}/versions/${versions[1].id}`).set(auth).expect(200);
    expect(published.body.meals.map((m: { name: string }) => m.name)).toEqual(['Café da manhã', 'Almoço', 'Jantar']);
    expect(published.body.meals[0].totals.kcal).toBeCloseTo(195 * 1.1 + 165, 1);
    expect(published.body.dayTotals.kcal).toBeCloseTo(3 * (195 * 1.1 + 165), 1);
    expect(published.body.days).toHaveLength(1);
    expect(published.body.days[0].nutrition.min.kcal).toBeCloseTo(published.body.dayTotals.kcal, 1);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    const mine = await request(app.getHttpServer()).get('/client/diet').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    const meals = mine.body.diet.meals;
    expect(meals.map((m: { name: string; order: number; time: string }) => [m.name, m.order, m.time])).toEqual([
      ['Café da manhã', 0, '07:00'],
      ['Almoço', 1, '08:00'],
      ['Jantar', 2, '09:00'],
    ]);
    expect(meals[1].notes).toBe('Mastigar devagar');
    expect(meals[0].foods.map((f: { quantity: number; unit: string }) => [f.quantity, f.unit])).toEqual([
      [150, 'g'],
      [100, 'g'],
    ]);
    expect(meals[0].foods[0].kcal).toBeCloseTo(195 * 1.1, 6);
    expect(meals[0].foods[1].kcal).toBe(165);
    expect(mine.body.diet.days[0].label).toBeNull();
  });
});
