-- P1 da nova estrutura de dietas (ADITIVA — nada é removido nem recalculado).
--   DietVersion ── patient_guidelines (texto ao paciente)
--               ├─ diet_supplements
--               └─ diet_days ─ meals ─ meal_groups ─ meal_choices ─ meal_foods
-- Colunas novas de vínculo (meals.diet_day_id, meal_foods.meal_choice_id) ficam
-- OPCIONAIS nesta etapa; viram obrigatórias só no P5. meal_foods passa a aceitar
-- item fora do catálogo (custom_food_name) e quantidade vazia/faixa/"à vontade".
-- kcal, macros, quantidades e alimentos já gravados NÃO são alterados.

-- CreateEnum
CREATE TYPE "DietDayKind" AS ENUM ('training', 'rest', 'other');

-- CreateEnum
CREATE TYPE "MealGroupKind" AS ENUM ('fixed', 'meal_options', 'alternatives');

-- AlterTable
ALTER TABLE "diet_versions" ADD COLUMN     "patient_guidelines" TEXT;

-- AlterTable
ALTER TABLE "meal_foods" ADD COLUMN     "custom_food_name" TEXT,
ADD COLUMN     "is_free_quantity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meal_choice_id" TEXT,
ADD COLUMN     "quantity_max" DOUBLE PRECISION,
ALTER COLUMN "food_id" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "unit" DROP NOT NULL;

-- AlterTable
ALTER TABLE "meals" ADD COLUMN     "diet_day_id" TEXT;

-- CreateTable
CREATE TABLE "diet_days" (
    "id" TEXT NOT NULL,
    "diet_version_id" TEXT NOT NULL,
    "label" TEXT,
    "kind" "DietDayKind" NOT NULL DEFAULT 'other',
    "usage_notes" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diet_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_groups" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "kind" "MealGroupKind" NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_choices" (
    "id" TEXT NOT NULL,
    "meal_group_id" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_supplements" (
    "id" TEXT NOT NULL,
    "diet_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "quantity_max" DOUBLE PRECISION,
    "unit_text" TEXT,
    "timing" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diet_supplements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diet_days_diet_version_id_order_idx" ON "diet_days"("diet_version_id", "order");

-- CreateIndex
CREATE INDEX "meal_groups_meal_id_order_idx" ON "meal_groups"("meal_id", "order");

-- CreateIndex
CREATE INDEX "meal_choices_meal_group_id_order_idx" ON "meal_choices"("meal_group_id", "order");

-- CreateIndex
CREATE INDEX "diet_supplements_diet_version_id_order_idx" ON "diet_supplements"("diet_version_id", "order");

-- CreateIndex
CREATE INDEX "meal_foods_meal_choice_id_order_idx" ON "meal_foods"("meal_choice_id", "order");

-- CreateIndex
CREATE INDEX "meals_diet_day_id_order_idx" ON "meals"("diet_day_id", "order");

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_diet_day_id_fkey" FOREIGN KEY ("diet_day_id") REFERENCES "diet_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_days" ADD CONSTRAINT "diet_days_diet_version_id_fkey" FOREIGN KEY ("diet_version_id") REFERENCES "diet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_groups" ADD CONSTRAINT "meal_groups_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_choices" ADD CONSTRAINT "meal_choices_meal_group_id_fkey" FOREIGN KEY ("meal_group_id") REFERENCES "meal_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_supplements" ADD CONSTRAINT "diet_supplements_diet_version_id_fkey" FOREIGN KEY ("diet_version_id") REFERENCES "diet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_meal_choice_id_fkey" FOREIGN KEY ("meal_choice_id") REFERENCES "meal_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridade dos itens novos (todas as linhas existentes já satisfazem: food_id
-- é preenchido em todas e quantity_max ainda não existia).
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_food_or_custom_chk"
  CHECK ("food_id" IS NOT NULL OR "custom_food_name" IS NOT NULL);
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_quantity_range_chk"
  CHECK ("quantity_max" IS NULL OR ("quantity" IS NOT NULL AND "quantity_max" >= "quantity"));

-- BACKFILL BEGIN — conversão das dietas existentes (idempotente: só cria o que falta).
-- 1) Cada versão sem dia ganha 1 dia único (label nulo).
INSERT INTO "diet_days" ("id", "diet_version_id", "label", "kind", "usage_notes", "order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, v."id", NULL, 'other', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "diet_versions" v
WHERE NOT EXISTS (SELECT 1 FROM "diet_days" d WHERE d."diet_version_id" = v."id");

-- 2) Cada refeição sem dia é ligada ao primeiro dia da sua versão.
UPDATE "meals" m
SET "diet_day_id" = (
  SELECT d."id" FROM "diet_days" d
  WHERE d."diet_version_id" = m."diet_version_id"
  ORDER BY d."order", d."created_at", d."id"
  LIMIT 1
)
WHERE m."diet_day_id" IS NULL;

-- 3) Cada refeição sem grupo ganha 1 grupo "fixed" (tudo é consumido, como hoje).
INSERT INTO "meal_groups" ("id", "meal_id", "kind", "label", "order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m."id", 'fixed', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "meals" m
WHERE NOT EXISTS (SELECT 1 FROM "meal_groups" g WHERE g."meal_id" = m."id");

-- 4) Cada grupo "fixed" sem escolha ganha a sua escolha única.
INSERT INTO "meal_choices" ("id", "meal_group_id", "label", "order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, g."id", NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "meal_groups" g
WHERE g."kind" = 'fixed'
  AND NOT EXISTS (SELECT 1 FROM "meal_choices" c WHERE c."meal_group_id" = g."id");

-- 5) Cada item sem escolha é ligado à escolha do grupo "fixed" da sua refeição.
--    (só o vínculo muda — quantity, unit, kcal e macros ficam intactos)
UPDATE "meal_foods" f
SET "meal_choice_id" = (
  SELECT c."id" FROM "meal_groups" g
  JOIN "meal_choices" c ON c."meal_group_id" = g."id"
  WHERE g."meal_id" = f."meal_id" AND g."kind" = 'fixed'
  ORDER BY g."order", c."order", c."id"
  LIMIT 1
)
WHERE f."meal_choice_id" IS NULL;
-- BACKFILL END
