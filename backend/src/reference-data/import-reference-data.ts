import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { ExerciseType, ExerciseScope, PrismaClient, Role } from '@prisma/client';
import { buildTacoCatalog } from './taco/taco-catalog';
import { importTacoCatalog, TacoImportReport } from './taco/taco-catalog-import';
import { PrismaTacoCatalogStore } from './taco/taco-catalog-stores';
import { parseTaco } from './taco/taco-parser';
import { FoodListChoiceFile, FoodListImportReport, importFoodList } from './taco/food-list-import';
import { PrismaFoodListStore } from './taco/food-list-stores';

function loadJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'data', fileName), 'utf-8')) as T;
}

/** Planilha oficial da TACO 4ª edição (copiada para o dist pelo nest-cli.json). */
export const TACO_SOURCE_FILE = join(__dirname, 'taco', 'source', 'Taco-4a-Edicao.xlsx');

// Conta "dona" técnica do catálogo global importado — precisa existir porque
// Food.createdByProfessionalId e Exercise.createdByProfessionalId são
// obrigatórios (toda Professional é 1:1 com um User real). Ninguém conhece a
// senha (gerada e descartada na hora, nunca logada nem persistida em texto):
// esta conta nunca deve logar, só serve como referência de proveniência.
export const SYSTEM_PROFESSIONAL_EMAIL = 'sistema.catalogo@bocadodenutricao.com.br';
const SYSTEM_PROFESSIONAL_NAME = 'Catálogo Bocado de Nutrição (sistema)';

interface ExerciseSeed {
  name: string;
  type: ExerciseType;
  muscleGroup?: string;
  equipment?: string;
  instructions?: string;
}

export interface ImportSummary {
  systemProfessionalId: string;
  foods: TacoImportReport;
  /** Lista do Bocado × TACO (escolhas aprovadas) e apelidos de busca. */
  foodList: FoodListImportReport;
  exercises: { created: number; skipped: number; approved: number };
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

/**
 * Catálogo oficial de alimentos = os 597 registros da TACO 4ª edição, lidos da
 * planilha. Idempotente pela chave "taco4:<nº>"; adota os 33 alimentos do
 * importador antigo (foods.json, hoje só histórico) sem duplicar; nunca apaga.
 */
async function importFoods(prisma: PrismaClient, systemProfessionalId: string): Promise<TacoImportReport> {
  const records = buildTacoCatalog(parseTaco(TACO_SOURCE_FILE));
  return importTacoCatalog(new PrismaTacoCatalogStore(prisma, systemProfessionalId), records);
}

/**
 * Os exercícios de exercises.json SÃO o catálogo oficial: entram já aprovados
 * (Fase 15 — global só é visível a outros profissionais com approvedAt). Um
 * oficial que já existia pendente é aprovado; aprovação existente nunca é
 * sobrescrita. Nada fora desta lista (conta do sistema + nome oficial) é tocado.
 */
async function importExercises(
  prisma: PrismaClient,
  systemProfessionalId: string,
): Promise<{ created: number; skipped: number; approved: number }> {
  let created = 0;
  let skipped = 0;
  let approved = 0;

  const exercisesData = loadJson<ExerciseSeed[]>('exercises.json');
  for (const entry of exercisesData) {
    const existing = await prisma.exercise.findFirst({
      where: { name: entry.name, scope: ExerciseScope.global, createdByProfessionalId: systemProfessionalId },
    });
    if (existing) {
      skipped += 1;
      if (!existing.approvedAt) {
        await prisma.exercise.update({ where: { id: existing.id }, data: { approvedAt: new Date() } });
        approved += 1;
      }
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
        approvedAt: new Date(),
      },
    });
    created += 1;
  }

  return { created, skipped, approved };
}

export async function importReferenceData(prisma: PrismaClient): Promise<ImportSummary> {
  const systemProfessionalId = await ensureSystemProfessional(prisma);
  const foods = await importFoods(prisma, systemProfessionalId);
  // Depois da TACO: as escolhas apontam para os alimentos pela chave "taco4:<nº>".
  const foodList = await importFoodList(new PrismaFoodListStore(prisma), loadJson<FoodListChoiceFile>('lista-bocado-escolhas.json'));
  const exercises = await importExercises(prisma, systemProfessionalId);
  return { systemProfessionalId, foods, foodList, exercises };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await importReferenceData(prisma);
    const f = summary.foods;
    console.log(
      `Alimentos (TACO 4ª edição): ${f.encontrados} encontrados, ${f.inseridos} inseridos, ${f.atualizados} atualizados, ` +
        `${f.ignorados} ignorados (sem mudança), ${f.duplicados} duplicados.`,
    );
    for (const d of f.detalhes.duplicados) console.log(`  duplicado: ${d.chave} ${d.nome} — ${d.motivo}`);
    for (const u of f.detalhes.atualizados) console.log(`  atualizado: ${u.chave} ${u.nome} — ${u.motivo}`);
    for (const n of f.detalhes.antigosSemCorrespondencia) console.log(`  antigo sem correspondência (mantido): ${n}`);
    const l = summary.foodList;
    console.log(
      `Lista do Bocado × TACO: ${l.itens.criados} itens criados, ${l.itens.atualizados} atualizados, ${l.itens.semMudanca} sem mudança; ` +
        `apelidos: ${l.apelidos.criados} criados, ${l.apelidos.atualizados} atualizados, ${l.apelidos.semMudanca} sem mudança (${l.apelidos.ligamSozinhos} ligam sozinhos).`,
    );
    for (const a of l.apelidosEmConflito) console.log(`  apelido em conflito (não liga sozinho): ${a}`);
    console.log(
      `Exercícios: ${summary.exercises.created} criados, ${summary.exercises.skipped} já existiam ` +
        `(${summary.exercises.approved} pendente(s) aprovado(s)).`,
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
