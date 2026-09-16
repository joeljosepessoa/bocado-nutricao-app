-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('admin_created', 'professional_suspended', 'professional_reactivated', 'content_approved', 'content_rejected');

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "approved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "approved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "action" "AdminAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (Fase 15, decisão 3, aprovada): todo conteúdo global já existente
-- antes desta fase é considerado pré-aprovado — a moderação obrigatória só
-- vale para conteúdo global criado a partir de agora. Escopo privado nunca é
-- tocado (não é submetido à moderação global).
UPDATE "foods" SET "approved_at" = "created_at" WHERE "scope" = 'global' AND "approved_at" IS NULL;
UPDATE "exercises" SET "approved_at" = "created_at" WHERE "scope" = 'global' AND "approved_at" IS NULL;
