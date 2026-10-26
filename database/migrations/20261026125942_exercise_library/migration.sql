-- Biblioteca de exercícios: vários grupos por exercício, seção da biblioteca, presets do profissional
-- e a permissão de editar o catálogo oficial. Só acrescenta (colunas novas com padrão, tabela nova) e
-- deixa sha256 da mídia opcional. Nenhum dado existente muda, exceto preencher muscle_groups com o
-- grupo que cada exercício já tinha.

-- AlterTable
ALTER TABLE "exercise_media" ALTER COLUMN "sha256" DROP NOT NULL;

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "muscle_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "can_edit_catalog" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "exercise_presets" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER,
    "reps_min" INTEGER,
    "reps_max" INTEGER,
    "rest_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_presets_professional_id_idx" ON "exercise_presets"("professional_id");

-- AddForeignKey
ALTER TABLE "exercise_presets" ADD CONSTRAINT "exercise_presets_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_presets" ADD CONSTRAINT "exercise_presets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exercícios que já existiam: a lista de grupos começa com o grupo que eles já tinham.
UPDATE "exercises" SET "muscle_groups" = ARRAY["muscle_group"] WHERE "muscle_group" IS NOT NULL AND btrim("muscle_group") <> '';
