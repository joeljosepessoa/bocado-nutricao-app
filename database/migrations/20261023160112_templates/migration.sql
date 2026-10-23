-- Modelos de dieta e treino da biblioteca do profissional (sem paciente).
-- Só cria a tabela nova; nenhuma tabela existente muda.

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('diet', 'workout');

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" JSONB NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_professional_id_kind_deleted_at_idx" ON "templates"("professional_id", "kind", "deleted_at");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
