import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIGRATIONS = join(__dirname, '../../database/migrations');
const migrationSql = (suffix: string) => {
  const folder = readdirSync(MIGRATIONS).find((name) => name.endsWith(suffix))!;
  return readFileSync(join(MIGRATIONS, folder, 'migration.sql'), 'utf-8');
};
const P1 = migrationSql('_diet_days_groups_choices_supplements');
const P5 = migrationSql('_diet_links_required');

/** Comandos SQL do arquivo (sem linhas de comentário). */
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

const backfillOf = (sql: string) => sql.slice(sql.indexOf('-- BACKFILL BEGIN'), sql.indexOf('-- BACKFILL END'));

const TABLES = ['diet_versions', 'diet_days', 'meals', 'meal_groups', 'meal_choices', 'meal_foods'];
class Rollback extends Error {}

/**
 * Roda `fn` sobre CÓPIAS TEMPORÁRIAS das tabelas da dieta (pg_temp vem antes
 * de public na busca, então o SQL da migration — sem esquema — atua só nelas).
 * Tudo dentro de uma transação desfeita no fim: as tabelas reais não são
 * travadas nem alteradas, e as outras suítes seguem em paralelo.
 * Nas cópias os vínculos voltam a ser opcionais (estado de antes do P5) e as
 * demais colunas ficam livres para o teste inserir só o que importa.
 */
async function onTempCopies(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  await prisma
    .$transaction(
      async (tx) => {
        for (const table of TABLES) {
          await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS) ON COMMIT DROP`);
          const required = await tx.$queryRawUnsafe<Array<{ attname: string }>>(
            `SELECT attname FROM pg_attribute WHERE attrelid = 'pg_temp."${table}"'::regclass AND attnum > 0 AND NOT attisdropped AND attnotnull AND attname <> 'id'`,
          );
          for (const { attname } of required) await tx.$executeRawUnsafe(`ALTER TABLE pg_temp."${table}" ALTER COLUMN "${attname}" DROP NOT NULL`);
        }
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000 },
    )
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

async function run(tx: Prisma.TransactionClient, sql: string[]) {
  for (const statement of sql) await tx.$executeRawUnsafe(statement);
}

const rows = <T>(tx: Prisma.TransactionClient, sql: string) => tx.$queryRawUnsafe<T[]>(sql);

/** Cenário: versão antiga sem dia; versão nova com refeição e item criados pelo código ANTERIOR ao P1 (sem vínculo). */
async function seedLegacy(tx: Prisma.TransactionClient) {
  await run(tx, statements(`
    INSERT INTO diet_versions (id) VALUES ('v-antiga'), ('v-nova');
    INSERT INTO diet_days (id, diet_version_id, kind, "order") VALUES ('d-nova', 'v-nova', 'training', 0);
    INSERT INTO meals (id, diet_version_id, diet_day_id, name, "order") VALUES
      ('m-antiga', 'v-antiga', NULL, 'Almoço', 0),
      ('m-nova', 'v-nova', 'd-nova', 'Café', 0),
      ('m-janela', 'v-nova', NULL, 'Lanche', 1);
    INSERT INTO meal_groups (id, meal_id, kind, "order") VALUES ('g-nova', 'm-nova', 'fixed', 0);
    INSERT INTO meal_choices (id, meal_group_id, "order") VALUES ('c-nova', 'g-nova', 0);
    INSERT INTO meal_foods (id, meal_id, meal_choice_id, food_id, "order", quantity, unit, kcal, protein_g) VALUES
      ('f-antiga-1', 'm-antiga', NULL, 'arroz', 0, 150, 'g', 195, 4.1),
      ('f-antiga-2', 'm-antiga', NULL, 'frango', 1, 100, 'g', 165, 31),
      ('f-nova', 'm-nova', 'c-nova', 'aveia', 0, 10, 'g', 39, 1.7),
      ('f-solta', 'm-nova', NULL, 'banana', 1, 110, 'g', 98, 1.4),
      ('f-janela', 'm-janela', NULL, 'iogurte', 0, 170, 'g', 120, 6);
  `),
  );
}

/** Código do Postgres para valor nulo em coluna obrigatória (a mensagem varia com o idioma do servidor). */
const NOT_NULL_VIOLATION = '23502';

const SNAPSHOT = `SELECT id, meal_id, food_id, "order", quantity, unit, kcal, protein_g FROM meal_foods ORDER BY id`;

describe('Migrations P1 + P5 — conversão das dietas e vínculos obrigatórios (banco real, cópias temporárias)', () => {
  afterAll(() => prisma.$disconnect());

  it('o P5 roda a MESMA conversão do P1 antes de tornar os vínculos obrigatórios', () => {
    expect(backfillOf(P5)).toBe(backfillOf(P1));
    const backfillEnd = P5.indexOf('-- BACKFILL END');
    expect(P5.indexOf('ALTER TABLE "meals" ALTER COLUMN "diet_day_id" SET NOT NULL')).toBeGreaterThan(backfillEnd);
    expect(P5.indexOf('ALTER TABLE "meal_foods" ALTER COLUMN "meal_choice_id" SET NOT NULL')).toBeGreaterThan(backfillEnd);
    // Nada além da conversão e dos dois SET NOT NULL (sem DROP, sem DELETE, sem recálculo).
    expect(P5).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b|SET\s+"(kcal|quantity|unit|food_id)"/i);
  });

  it('dieta antiga e item criado na janela do deploy são ligados; valores intactos; vínculos ficam obrigatórios', async () => {
    await onTempCopies(async (tx) => {
      await seedLegacy(tx);
      const before = await rows(tx, SNAPSHOT);

      await run(tx, statements(P5));

      // Versão antiga ganhou o dia único; refeições ligadas a um dia da PRÓPRIA versão.
      expect(await rows(tx, `SELECT diet_version_id, label, kind FROM diet_days ORDER BY diet_version_id`)).toEqual([
        { diet_version_id: 'v-antiga', label: null, kind: 'other' },
        { diet_version_id: 'v-nova', label: null, kind: 'training' },
      ]);
      expect(
        await rows(tx, `SELECT m.id, d.diet_version_id = m.diet_version_id AS mesma_versao FROM meals m JOIN diet_days d ON d.id = m.diet_day_id ORDER BY m.id`),
      ).toEqual([
        { id: 'm-antiga', mesma_versao: true },
        { id: 'm-janela', mesma_versao: true },
        { id: 'm-nova', mesma_versao: true },
      ]);
      // Cada refeição com 1 grupo fixo; item solto vai para a escolha fixa da SUA refeição (o já ligado não muda).
      expect(
        await rows(tx, `SELECT f.id, g.meal_id = f.meal_id AS mesma_refeicao, g.kind FROM meal_foods f JOIN meal_choices c ON c.id = f.meal_choice_id JOIN meal_groups g ON g.id = c.meal_group_id ORDER BY f.id`),
      ).toEqual([
        { id: 'f-antiga-1', mesma_refeicao: true, kind: 'fixed' },
        { id: 'f-antiga-2', mesma_refeicao: true, kind: 'fixed' },
        { id: 'f-janela', mesma_refeicao: true, kind: 'fixed' },
        { id: 'f-nova', mesma_refeicao: true, kind: 'fixed' },
        { id: 'f-solta', mesma_refeicao: true, kind: 'fixed' },
      ]);
      expect(await rows(tx, `SELECT meal_choice_id FROM meal_foods WHERE id IN ('f-nova', 'f-solta')`)).toEqual([{ meal_choice_id: 'c-nova' }, { meal_choice_id: 'c-nova' }]);
      // kcal, macros, quantidades, unidades e alimentos intactos.
      expect(await rows(tx, SNAPSHOT)).toEqual(before);
      // Vínculos agora obrigatórios.
      expect(
        await rows(tx, `SELECT attname, attnotnull FROM pg_attribute WHERE attname IN ('diet_day_id', 'meal_choice_id') AND attrelid IN ('pg_temp.meals'::regclass, 'pg_temp.meal_foods'::regclass) ORDER BY attname`),
      ).toEqual([
        { attname: 'diet_day_id', attnotnull: true },
        { attname: 'meal_choice_id', attnotnull: true },
      ]);

      // Idempotente: rodar a conversão de novo não cria nada.
      const count = async () => rows(tx, `SELECT (SELECT count(*) FROM diet_days)::int AS dias, (SELECT count(*) FROM meal_groups)::int AS grupos, (SELECT count(*) FROM meal_choices)::int AS escolhas`);
      const first = await count();
      await run(tx, statements(backfillOf(P5)));
      expect(await count()).toEqual(first);
    });
  });

  it('item solto que não tem para onde ir (refeição só com opções completas): a migration FALHA inteira, nada é aplicado', async () => {
    await expect(
      onTempCopies(async (tx) => {
        await run(tx, statements(`
          INSERT INTO diet_versions (id) VALUES ('v');
          INSERT INTO diet_days (id, diet_version_id, kind, "order") VALUES ('d', 'v', 'other', 0);
          INSERT INTO meals (id, diet_version_id, diet_day_id, name, "order") VALUES ('m', 'v', 'd', 'Café', 0);
          INSERT INTO meal_groups (id, meal_id, kind, "order") VALUES ('g', 'm', 'meal_options', 0);
          INSERT INTO meal_choices (id, meal_group_id, label, "order") VALUES ('c', 'g', 'Opção 1', 0);
          INSERT INTO meal_foods (id, meal_id, meal_choice_id, food_id, "order", quantity, unit, kcal) VALUES ('f', 'm', NULL, 'aveia', 0, 10, 'g', 39);
        `));
        await run(tx, statements(P5));
      }),
    ).rejects.toMatchObject({ meta: { code: NOT_NULL_VIOLATION } });
  });

  it('no banco real os vínculos já são obrigatórios: refeição sem dia ou item sem escolha é recusado', async () => {
    const columns = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string; is_nullable: string }>>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('diet_day_id', 'meal_choice_id') AND table_name IN ('meals', 'meal_foods') ORDER BY table_name`,
    );
    expect(columns).toEqual([
      { table_name: 'meal_foods', column_name: 'meal_choice_id', is_nullable: 'NO' },
      { table_name: 'meals', column_name: 'diet_day_id', is_nullable: 'NO' },
    ]);
    const version = await prisma.dietVersion.findFirstOrThrow();
    await expect(
      prisma.$executeRawUnsafe(`INSERT INTO public.meals (id, diet_version_id, name, "order") VALUES (gen_random_uuid()::text, '${version.id}', 'Sem dia', 0)`),
    ).rejects.toMatchObject({ meta: { code: NOT_NULL_VIOLATION } });
    const meal = await prisma.meal.findFirstOrThrow();
    await expect(
      prisma.$executeRawUnsafe(`INSERT INTO public.meal_foods (id, meal_id, custom_food_name, "order") VALUES (gen_random_uuid()::text, '${meal.id}', 'Sem escolha', 0)`),
    ).rejects.toMatchObject({ meta: { code: NOT_NULL_VIOLATION } });
  });
});
