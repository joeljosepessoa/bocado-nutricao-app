import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, FoodScope, ExerciseScope } from '@prisma/client';
import { importReferenceData } from '../src/reference-data/import-reference-data';

const prisma = new PrismaClient();

const SYSTEM_EMAIL = 'sistema.catalogo@bocadodenutricao.com.br';

/** Catálogo oficial = todos os registros da TACO 4ª edição. */
const FOODS_COUNT = 597;
const TACO_SOURCE = 'taco4';
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
    expect(summary.foods.encontrados).toBe(FOODS_COUNT);
    expect(summary.foods.inseridos + summary.foods.atualizados + summary.foods.ignorados).toBe(FOODS_COUNT);
    expect(summary.foods.duplicados).toBe(0);
    expect(summary.exercises.created + summary.exercises.skipped).toBe(EXERCISES_COUNT);

    const systemProfessional = await prisma.professional.findUnique({
      where: { id: summary.systemProfessionalId },
      include: { user: true },
    });
    expect(systemProfessional).not.toBeNull();
    expect(systemProfessional?.user.role).toBe('professional');
    expect(systemProfessional?.user.email).toBe(SYSTEM_EMAIL);

    const foods = await prisma.food.findMany({
      where: { createdByProfessionalId: summary.systemProfessionalId, sourceKey: { startsWith: `${TACO_SOURCE}:` } },
    });
    expect(foods.length).toBe(FOODS_COUNT);
    expect(new Set(foods.map((f) => f.sourceNumber))).toEqual(new Set(Array.from({ length: FOODS_COUNT }, (_, i) => i + 1)));
    for (const food of foods) {
      expect(food.scope).toBe(FoodScope.global);
      expect(food.source).toBe(TACO_SOURCE);
      expect(food.sourceEdition).toBe('TACO 4ª edição');
      expect(food.approvedAt).not.toBeNull();
      expect(food.sourceData).toBeTruthy();
      // Número = o da planilha; marcador da TACO nunca vira 0 (fica null, com o marcador em sourceData).
      // A TACO tem 4 carboidratos levemente negativos (cálculo por diferença): preservados como estão.
      const macros = (food.sourceData as { macros: Record<string, { valor: number | null; situacao: string }> }).macros;
      const pairs: Array<[number | null, string]> = [
        [food.kcalPer100, 'kcal'],
        [food.proteinGPer100, 'proteina'],
        [food.carbGPer100, 'carboidrato'],
        [food.fatGPer100, 'lipideos'],
      ];
      for (const [column, key] of pairs) {
        // O client tipado lê double com 16 algarismos; o exato é conferido em texto no teste do arroz.
        if (macros[key].situacao === 'valor') expect(column).toBeCloseTo(macros[key].valor!, 10);
        else expect(column).toBeNull();
      }
    }
    // Nenhum alimento antigo do sistema ficou sem chave (os 33 foram adotados).
    expect(await prisma.food.count({ where: { createdByProfessionalId: summary.systemProfessionalId, sourceKey: null } })).toBe(0);

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
    expect(second.foods).toMatchObject({ inseridos: 0, atualizados: 0, ignorados: FOODS_COUNT, duplicados: 0 });
    expect(second.exercises.created).toBe(0);
    expect(second.exercises.skipped).toBe(EXERCISES_COUNT);

    const usersAfter = await prisma.user.count({ where: { email: SYSTEM_EMAIL } });
    expect(usersAfter).toBe(Math.max(usersBefore, 1));
    expect(usersAfter).toBe(1);

    const totalFoods = await prisma.food.count({ where: { createdByProfessionalId: first.systemProfessionalId } });
    expect(totalFoods).toBe(FOODS_COUNT);
    expect(await prisma.food.count({ where: { sourceKey: { startsWith: `${TACO_SOURCE}:` } } })).toBe(FOODS_COUNT);

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

  it('alimento importado tem os valores exatos da TACO e é rastreável (Arroz, tipo 1, cozido = nº 3)', async () => {
    const summary = await importReferenceData(prisma);
    const arroz = await prisma.food.findUniqueOrThrow({ where: { sourceKey: 'taco4:3' } });
    expect(arroz).toMatchObject({ name: 'Arroz, tipo 1, cozido', sourceNumber: 3, foodGroup: 'Cereais e derivados', preparation: 'cozido' });
    expect(arroz.createdByProfessionalId).toBe(summary.systemProfessionalId);
    // Valor EXATO da planilha guardado no banco (coluna e sourceData), conferido em texto: o client
    // tipado do Prisma lê double com 16 algarismos (128.2584856666666), por isso a checagem é por SQL.
    const [exact] = await prisma.$queryRawUnsafe<Array<{ coluna: string; fonte: string }>>(
      `SELECT kcal_per_100::text AS coluna, source_data->'macros'->'kcal'->>'valor' AS fonte FROM foods WHERE source_key = 'taco4:3'`,
    );
    expect(exact).toEqual({ coluna: '128.25848566666664', fonte: '128.25848566666664' });
    expect(arroz.kcalPer100).toBeCloseTo(128.25848566666664, 10);
    expect(arroz.proteinGPer100).toBeCloseTo(2.52, 1);
  });

  it('marcadores da TACO ficam preservados: leite integral (nº 458) com * → macros null, nunca 0', async () => {
    await importReferenceData(prisma);
    const leite = await prisma.food.findUniqueOrThrow({ where: { sourceKey: 'taco4:458' } });
    expect([leite.kcalPer100, leite.proteinGPer100, leite.carbGPer100, leite.fatGPer100]).toEqual([null, null, null, null]);
    const data = leite.sourceData as { macros: Record<string, { situacao: string; bruto: unknown }> };
    expect(data.macros.kcal).toMatchObject({ situacao: 'em_reavaliacao', bruto: '*' });
  });

  it('banco recusa alimento de profissional sem os 4 macros (só o catálogo oficial pode ter macro null)', async () => {
    const { systemProfessionalId } = await importReferenceData(prisma);
    await expect(
      prisma.food.create({ data: { name: `Sem macro ${Date.now()}`, baseUnit: 'g', createdByProfessionalId: systemProfessionalId } }),
    ).rejects.toThrow(/foods_macros_required_unless_official_chk|23514|check constraint/i);
  });
});
