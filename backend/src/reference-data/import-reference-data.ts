import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { ExerciseType, FoodScope, ExerciseScope, NutritionUnit, PrismaClient, Role } from '@prisma/client';

function loadJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'data', fileName), 'utf-8')) as T;
}

// Conta "dona" técnica do catálogo global importado — precisa existir porque
// Food.createdByProfessionalId e Exercise.createdByProfessionalId são
// obrigatórios (toda Professional é 1:1 com um User real). Ninguém conhece a
// senha (gerada e descartada na hora, nunca logada nem persistida em texto):
// esta conta nunca deve logar, só serve como referência de proveniência.
export const SYSTEM_PROFESSIONAL_EMAIL = 'sistema.catalogo@bocadodenutricao.com.br';
const SYSTEM_PROFESSIONAL_NAME = 'Catálogo Bocado de Nutrição (sistema)';
const FOOD_SOURCE = 'taco';

interface FoodSeed {
  name: string;
  baseUnit: NutritionUnit;
  kcalPer100: number;
  proteinGPer100: number;
  carbGPer100: number;
  fatGPer100: number;
  fiberGPer100?: number;
}

interface ExerciseSeed {
  name: string;
  type: ExerciseType;
  muscleGroup?: string;
  equipment?: string;
  instructions?: string;
}

export interface ImportSummary {
  systemProfessionalId: string;
  foods: { created: number; skipped: number };
  exercises: { created: number; skipped: number };
}

async function ensureSystemProfessional(prisma: PrismaClient): Promise<string> {
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

  const user = await prisma.user.upsert({
    where: { email: SYSTEM_PROFESSIONAL_EMAIL },
    update: {},
    create: {
      email: SYSTEM_PROFESSIONAL_EMAIL,
      passwordHash,
      fullName: SYSTEM_PROFESSIONAL_NAME,
      role: Role.professional,
    },
  });

  await prisma.professional.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id },
  });

  return user.id;
}

async function importFoods(prisma: PrismaClient, systemProfessionalId: string): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  const foodsData = loadJson<FoodSeed[]>('foods.json');
  for (const entry of foodsData) {
    const existing = await prisma.food.findFirst({
      where: { name: entry.name, scope: FoodScope.global, createdByProfessionalId: systemProfessionalId },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.food.create({
      data: {
        name: entry.name,
        scope: FoodScope.global,
        baseUnit: entry.baseUnit,
        kcalPer100: entry.kcalPer100,
        proteinGPer100: entry.proteinGPer100,
        carbGPer100: entry.carbGPer100,
        fatGPer100: entry.fatGPer100,
        fiberGPer100: entry.fiberGPer100,
        source: FOOD_SOURCE,
        createdByProfessionalId: systemProfessionalId,
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function importExercises(prisma: PrismaClient, systemProfessionalId: string): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  const exercisesData = loadJson<ExerciseSeed[]>('exercises.json');
  for (const entry of exercisesData) {
    const existing = await prisma.exercise.findFirst({
      where: { name: entry.name, scope: ExerciseScope.global, createdByProfessionalId: systemProfessionalId },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.exercise.create({
      data: {
        name: entry.name,
        type: entry.type,
        muscleGroup: entry.muscleGroup,
        equipment: entry.equipment,
        instructions: entry.instructions,
        scope: ExerciseScope.global,
        createdByProfessionalId: systemProfessionalId,
      },
    });
    created += 1;
  }

  return { created, skipped };
}

export async function importReferenceData(prisma: PrismaClient): Promise<ImportSummary> {
  const systemProfessionalId = await ensureSystemProfessional(prisma);
  const foods = await importFoods(prisma, systemProfessionalId);
  const exercises = await importExercises(prisma, systemProfessionalId);
  return { systemProfessionalId, foods, exercises };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await importReferenceData(prisma);
    console.log(
      `Alimentos: ${summary.foods.created} criados, ${summary.foods.skipped} já existiam. ` +
        `Exercícios: ${summary.exercises.created} criados, ${summary.exercises.skipped} já existiam.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
