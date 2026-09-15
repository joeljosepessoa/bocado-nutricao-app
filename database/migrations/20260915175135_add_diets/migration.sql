-- CreateEnum
CREATE TYPE "FoodScope" AS ENUM ('global', 'private');

-- CreateEnum
CREATE TYPE "DietStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "DietVersionStatus" AS ENUM ('draft', 'published', 'superseded');

-- CreateEnum
CREATE TYPE "NutritionUnit" AS ENUM ('g', 'ml', 'unit', 'tablespoon', 'teaspoon', 'cup', 'slice');

-- CreateEnum
CREATE TYPE "DietAuditAction" AS ENUM ('created', 'updated', 'version_created', 'version_updated', 'published', 'archived', 'meal_added', 'meal_updated', 'meal_removed', 'food_added', 'food_updated', 'food_removed', 'read', 'listed');

-- CreateTable
CREATE TABLE "foods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "FoodScope" NOT NULL DEFAULT 'global',
    "owner_professional_id" TEXT,
    "base_unit" "NutritionUnit" NOT NULL,
    "kcal_per_100" DOUBLE PRECISION NOT NULL,
    "protein_g_per_100" DOUBLE PRECISION NOT NULL,
    "carb_g_per_100" DOUBLE PRECISION NOT NULL,
    "fat_g_per_100" DOUBLE PRECISION NOT NULL,
    "fiber_g_per_100" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by_professional_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_unit_conversions" (
    "id" TEXT NOT NULL,
    "food_id" TEXT NOT NULL,
    "unit" "NutritionUnit" NOT NULL,
    "grams_equivalent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "food_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_substitutions" (
    "id" TEXT NOT NULL,
    "original_food_id" TEXT NOT NULL,
    "substitute_food_id" TEXT NOT NULL,
    "substitute_quantity" DOUBLE PRECISION NOT NULL,
    "substitute_unit" "NutritionUnit" NOT NULL,
    "substitute_kcal" DOUBLE PRECISION,
    "substitute_protein_g" DOUBLE PRECISION,
    "substitute_carb_g" DOUBLE PRECISION,
    "substitute_fat_g" DOUBLE PRECISION,
    "notes" TEXT,
    "created_by_professional_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diets" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "status" "DietStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_versions" (
    "id" TEXT NOT NULL,
    "diet_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "DietVersionStatus" NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "objective" TEXT,
    "target_calories" DOUBLE PRECISION,
    "target_protein_g" DOUBLE PRECISION,
    "target_carb_g" DOUBLE PRECISION,
    "target_fat_g" DOUBLE PRECISION,
    "created_by_professional_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diet_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "diet_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "time" TEXT,
    "notes" TEXT,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_foods" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "food_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "NutritionUnit" NOT NULL,
    "grams_equivalent" DOUBLE PRECISION,
    "kcal" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "carb_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "fiber_g" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "meal_foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "diet_id" TEXT NOT NULL,
    "diet_version_id" TEXT,
    "action" "DietAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diet_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "foods_name_idx" ON "foods"("name");

-- CreateIndex
CREATE INDEX "foods_scope_owner_professional_id_idx" ON "foods"("scope", "owner_professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_unit_conversions_food_id_unit_key" ON "food_unit_conversions"("food_id", "unit");

-- CreateIndex
CREATE INDEX "food_substitutions_original_food_id_idx" ON "food_substitutions"("original_food_id");

-- CreateIndex
CREATE INDEX "diets_client_id_idx" ON "diets"("client_id");

-- CreateIndex
CREATE INDEX "diets_professional_id_idx" ON "diets"("professional_id");

-- CreateIndex
CREATE INDEX "diet_versions_diet_id_status_idx" ON "diet_versions"("diet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "diet_versions_diet_id_version_number_key" ON "diet_versions"("diet_id", "version_number");

-- CreateIndex
CREATE INDEX "meals_diet_version_id_order_idx" ON "meals"("diet_version_id", "order");

-- CreateIndex
CREATE INDEX "meal_foods_meal_id_order_idx" ON "meal_foods"("meal_id", "order");

-- CreateIndex
CREATE INDEX "diet_audit_logs_diet_id_created_at_idx" ON "diet_audit_logs"("diet_id", "created_at");

-- CreateIndex
CREATE INDEX "diet_audit_logs_professional_id_created_at_idx" ON "diet_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_professional_id_fkey" FOREIGN KEY ("owner_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_created_by_professional_id_fkey" FOREIGN KEY ("created_by_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_unit_conversions" ADD CONSTRAINT "food_unit_conversions_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_substitutions" ADD CONSTRAINT "food_substitutions_original_food_id_fkey" FOREIGN KEY ("original_food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_substitutions" ADD CONSTRAINT "food_substitutions_substitute_food_id_fkey" FOREIGN KEY ("substitute_food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_substitutions" ADD CONSTRAINT "food_substitutions_created_by_professional_id_fkey" FOREIGN KEY ("created_by_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diets" ADD CONSTRAINT "diets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diets" ADD CONSTRAINT "diets_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_versions" ADD CONSTRAINT "diet_versions_diet_id_fkey" FOREIGN KEY ("diet_id") REFERENCES "diets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_diet_version_id_fkey" FOREIGN KEY ("diet_version_id") REFERENCES "diet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_foods" ADD CONSTRAINT "meal_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_audit_logs" ADD CONSTRAINT "diet_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_audit_logs" ADD CONSTRAINT "diet_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_audit_logs" ADD CONSTRAINT "diet_audit_logs_diet_id_fkey" FOREIGN KEY ("diet_id") REFERENCES "diets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_audit_logs" ADD CONSTRAINT "diet_audit_logs_diet_version_id_fkey" FOREIGN KEY ("diet_version_id") REFERENCES "diet_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
