-- CreateEnum
CREATE TYPE "FoodListMappingStatus" AS ENUM ('encontrado', 'precisa_revisao', 'nao_encontrado', 'fora_da_taco');

-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "food_group" TEXT,
ADD COLUMN     "preparation" TEXT,
ADD COLUMN     "sodium_mg_per_100" DOUBLE PRECISION,
ADD COLUMN     "source_data" JSONB,
ADD COLUMN     "source_edition" TEXT,
ADD COLUMN     "source_hash" TEXT,
ADD COLUMN     "source_key" TEXT,
ADD COLUMN     "source_number" INTEGER,
ALTER COLUMN "kcal_per_100" DROP NOT NULL,
ALTER COLUMN "protein_g_per_100" DROP NOT NULL,
ALTER COLUMN "carb_g_per_100" DROP NOT NULL,
ALTER COLUMN "fat_g_per_100" DROP NOT NULL;

-- CreateTable
CREATE TABLE "food_list_mappings" (
    "id" TEXT NOT NULL,
    "list_group" TEXT NOT NULL,
    "list_item_name" TEXT NOT NULL,
    "status" "FoodListMappingStatus" NOT NULL,
    "food_id" TEXT,
    "candidate_keys" TEXT[],
    "notes" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_list_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "food_id" TEXT,
    "mapping_id" TEXT,
    "auto_link" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_list_mappings_food_id_idx" ON "food_list_mappings"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_list_mappings_list_group_list_item_name_key" ON "food_list_mappings"("list_group", "list_item_name");

-- CreateIndex
CREATE UNIQUE INDEX "food_aliases_alias_key" ON "food_aliases"("alias");

-- CreateIndex
CREATE INDEX "food_aliases_food_id_idx" ON "food_aliases"("food_id");

-- CreateIndex
CREATE INDEX "food_aliases_mapping_id_idx" ON "food_aliases"("mapping_id");

-- CreateIndex
CREATE UNIQUE INDEX "foods_source_key_key" ON "foods"("source_key");

-- CreateIndex
CREATE INDEX "foods_food_group_idx" ON "foods"("food_group");

-- AddForeignKey
ALTER TABLE "food_list_mappings" ADD CONSTRAINT "food_list_mappings_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "food_list_mappings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Só o catálogo oficial (source_key preenchida) pode ter macro sem número, quando
-- a TACO traz marcador (Tr, NA, *, vazio). Alimento cadastrado por profissional
-- continua exigindo os 4 valores. Todas as linhas existentes satisfazem (eram NOT NULL).
ALTER TABLE "foods" ADD CONSTRAINT "foods_macros_required_unless_official_chk"
  CHECK ("source_key" IS NOT NULL OR (
    "kcal_per_100" IS NOT NULL AND "protein_g_per_100" IS NOT NULL AND
    "carb_g_per_100" IS NOT NULL AND "fat_g_per_100" IS NOT NULL));
