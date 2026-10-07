-- P5 da nova estrutura de dietas: os vínculos passam a ser OBRIGATÓRIOS.
--   meals.diet_day_id       (toda refeição pertence a um dia)
--   meal_foods.meal_choice_id (todo item pertence a uma escolha)
-- Antes, a MESMA conversão idempotente do P1 roda de novo: liga o que o código
-- anterior ao P1 possa ter criado sem vínculo entre a migration P1 e o deploy.
-- Só cria o que falta; kcal, macros, quantidades e alimentos não são tocados.
-- Se ainda sobrar algum vínculo vazio (ex.: item solto numa refeição só com
-- opções completas), o SET NOT NULL falha e NADA desta migration é aplicado.

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

-- AlterTable
ALTER TABLE "meals" ALTER COLUMN "diet_day_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "meal_foods" ALTER COLUMN "meal_choice_id" SET NOT NULL;
