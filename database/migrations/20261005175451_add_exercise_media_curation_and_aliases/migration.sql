-- Curadoria das mídias de exercício e sinônimos de exercício (aditiva).
-- Colunas novas com DEFAULT (vínculos existentes ficam "pending" até o backfill
-- revisado); tabela nova exercise_aliases; Exercise.slug nulo e único.
-- Nenhuma coluna existente é alterada ou removida.
-- CreateEnum
CREATE TYPE "ExerciseMediaCurationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ExerciseMediaSex" AS ENUM ('male', 'female', 'unspecified');

-- CreateEnum
CREATE TYPE "ExerciseMediaView" AS ENUM ('side', 'front', 'back', 'unspecified');

-- AlterTable
ALTER TABLE "exercise_media" ADD COLUMN     "curation_status" "ExerciseMediaCurationStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "equipment" TEXT,
ADD COLUMN     "is_primary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "sex" "ExerciseMediaSex" NOT NULL DEFAULT 'unspecified',
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source_file_name" TEXT,
ADD COLUMN     "variation" TEXT,
ADD COLUMN     "view" "ExerciseMediaView" NOT NULL DEFAULT 'unspecified';

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "exercise_aliases" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "source" TEXT NOT NULL DEFAULT 'curated',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_aliases_normalized_alias_idx" ON "exercise_aliases"("normalized_alias");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_aliases_exercise_id_normalized_alias_key" ON "exercise_aliases"("exercise_id", "normalized_alias");

-- CreateIndex
CREATE INDEX "exercise_media_exercise_id_curation_status_idx" ON "exercise_media"("exercise_id", "curation_status");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_slug_key" ON "exercises"("slug");

-- AddForeignKey
ALTER TABLE "exercise_aliases" ADD CONSTRAINT "exercise_aliases_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

