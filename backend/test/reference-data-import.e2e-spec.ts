import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, FoodScope, ExerciseScope } from '@prisma/client';
import { importReferenceData } from '../src/reference-data/import-reference-data';

const prisma = new PrismaClient();

const SYSTEM_EMAIL = 'sistema.catalogo@bocadodenutricao.com.br';

const FOODS_COUNT = (
  JSON.parse(readFileSync(join(__dirname, '../src/reference-data/data/foods.json'), 'utf-8')) as unknown[]
).length;
const EXERCISE_NAMES = (
  JSON.parse(readFileSync(join(__dirname, '../src/reference-data/data/exercises.json'), 'utf-8')) as { name: string }[]
).map((exercise) => exercise.name);
const EXERCISES_COUNT = EXERCISE_NAMES.length;

describe('Importação de dados de referência (F14)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('cria (ou reconhece já existente) a conta de sistema e o catálogo completo de alimentos e exercícios', async () => {
    const summary = await importReferenceData(prisma);

    expect(summary.systemProfessionalId).toBeTruthy();
    expect(summary.foods.created + summary.foods.skipped).toBe(FOODS_COUNT);
    expect(summary.exercises.created + summary.exercises.skipped).toBe(EXERCISES_COUNT);

    const systemProfessional = await prisma.professional.findUnique({
      where: { id: summary.systemProfessionalId },
      include: { user: true },
    });
    expect(systemProfessional).not.toBeNull();
    expect(systemProfessional?.user.role).toBe('professional');
    expect(systemProfessional?.user.email).toBe(SYSTEM_EMAIL);

    const foods = await prisma.food.findMany({
      where: { createdByProfessionalId: summary.systemProfessionalId },
    });
    expect(foods.length).toBe(FOODS_COUNT);
    for (const food of foods) {
      expect(food.scope).toBe(FoodScope.global);
      expect(food.source).toBe('taco');
      expect(food.kcalPer100).toBeGreaterThan(0);
      expect(food.proteinGPer100).toBeGreaterThanOrEqual(0);
      expect(food.carbGPer100).toBeGreaterThanOrEqual(0);
      expect(food.fatGPer100).toBeGreaterThanOrEqual(0);
    }

    const exercises = await prisma.exercise.findMany({
      where: { createdByProfessionalId: summary.systemProfessionalId },
    });
    expect(exercises.length).toBe(EXERCISES_COUNT);
    for (const exercise of exercises) {
      expect(exercise.scope).toBe(ExerciseScope.global);
      expect(exercise.type).toBeTruthy();
    }
  });

  it('é idempotente — rodar de novo não duplica nem recria a conta de sistema', async () => {
    const usersBefore = await prisma.user.count({ where: { email: SYSTEM_EMAIL } });

    const first = await importReferenceData(prisma);
    const second = await importReferenceData(prisma);

    expect(second.systemProfessionalId).toBe(first.systemProfessionalId);
    expect(second.foods.created).toBe(0);
    expect(second.foods.skipped).toBe(FOODS_COUNT);
    expect(second.exercises.created).toBe(0);
    expect(second.exercises.skipped).toBe(EXERCISES_COUNT);

    const usersAfter = await prisma.user.count({ where: { email: SYSTEM_EMAIL } });
    expect(usersAfter).toBe(Math.max(usersBefore, 1));
    expect(usersAfter).toBe(1);

    const totalFoods = await prisma.food.count({ where: { createdByProfessionalId: first.systemProfessionalId } });
    expect(totalFoods).toBe(FOODS_COUNT);

    const totalExercises = await prisma.exercise.count({ where: { createdByProfessionalId: first.systemProfessionalId } });
    expect(totalExercises).toBe(EXERCISES_COUNT);
  });

  it('os 36 exercícios do catálogo oficial ficam aprovados (visíveis aos profissionais); pendente oficial é aprovado, aprovação existente não muda', async () => {
    const { systemProfessionalId } = await importReferenceData(prisma);
    const official = await prisma.exercise.findMany({ where: { createdByProfessionalId: systemProfessionalId, name: { in: EXERCISE_NAMES } } });
    expect(official).toHaveLength(EXERCISES_COUNT);
    expect(official.every((exercise) => exercise.approvedAt !== null)).toBe(true);

    // Um oficial que ficou pendente (ex.: importado antes desta regra) é aprovado na próxima execução.
    const target = official[0];
    await prisma.exercise.update({ where: { id: target.id }, data: { approvedAt: null } });
    const rerun = await importReferenceData(prisma);
    expect(rerun.exercises).toMatchObject({ created: 0, skipped: EXERCISES_COUNT, approved: 1 });
    const reapproved = await prisma.exercise.findUniqueOrThrow({ where: { id: target.id } });
    expect(reapproved.approvedAt).not.toBeNull();

    // Aprovação já existente é preservada (não sobrescreve a data).
    const again = await importReferenceData(prisma);
    expect(again.exercises.approved).toBe(0);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: target.id } })).approvedAt).toEqual(reapproved.approvedAt);
  });

  it('não aprova nada fora do catálogo oficial, não importa ExerciseMedia e não grava URL', async () => {
    const { systemProfessionalId } = await importReferenceData(prisma);
    const tag = Date.now();
    // Mesmo nome de um oficial, mas de um profissional; e um exercício do sistema fora de exercises.json.
    const professional = await prisma.user.create({
      data: { email: `prof.ref.${tag}@teste.com`, passwordHash: 'x', fullName: 'Prof teste', role: 'professional', professional: { create: {} } },
    });
    const sameNameOtherOwner = await prisma.exercise.create({
      data: { name: 'Rosca direta', type: 'strength', scope: ExerciseScope.global, createdByProfessionalId: professional.id },
    });
    const systemOutsideCatalog = await prisma.exercise.create({
      data: { name: `Variação não catalogada ${tag}`, type: 'strength', scope: ExerciseScope.global, createdByProfessionalId: systemProfessionalId },
    });
    const mediaBefore = await prisma.exerciseMedia.count();

    try {
      const summary = await importReferenceData(prisma);
      expect(summary.exercises.created).toBe(0);

      expect((await prisma.exercise.findUniqueOrThrow({ where: { id: sameNameOtherOwner.id } })).approvedAt).toBeNull();
      expect((await prisma.exercise.findUniqueOrThrow({ where: { id: systemOutsideCatalog.id } })).approvedAt).toBeNull();
      expect(await prisma.exerciseMedia.count()).toBe(mediaBefore);

      const official = await prisma.exercise.findMany({ where: { createdByProfessionalId: systemProfessionalId, name: { in: EXERCISE_NAMES } } });
      expect(official).toHaveLength(EXERCISES_COUNT);
      for (const exercise of official) {
        expect(`${exercise.imageUrl ?? ''}${exercise.videoUrl ?? ''}`).not.toMatch(/X-Amz|r2\.cloudflarestorage/i);
      }
    } finally {
      await prisma.exercise.deleteMany({ where: { id: { in: [sameNameOtherOwner.id, systemOutsideCatalog.id] } } });
      await prisma.professional.delete({ where: { id: professional.id } });
      await prisma.user.delete({ where: { id: professional.id } });
    }
  });

  it('alimento importado tem valores nutricionais reais e rastreáveis (Arroz, tipo 1, cozido)', async () => {
    const summary = await importReferenceData(prisma);
    const arroz = await prisma.food.findFirst({
      where: { name: 'Arroz, tipo 1, cozido', createdByProfessionalId: summary.systemProfessionalId },
    });
    expect(arroz).not.toBeNull();
    expect(arroz?.kcalPer100).toBeCloseTo(128.26, 1);
    expect(arroz?.proteinGPer100).toBeCloseTo(2.52, 1);
    expect(arroz?.source).toBe('taco');
  });
});
