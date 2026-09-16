-- CreateEnum
CREATE TYPE "AiFeatureKey" AS ENUM ('draft_note', 'explain_evaluation', 'narrate_trend');

-- CreateEnum
CREATE TYPE "AiInteractionStatus" AS ENUM ('succeeded', 'failed', 'blocked_by_consent', 'invalid_output', 'timeout');

-- CreateEnum
CREATE TYPE "AiAuditAction" AS ENUM ('consent_granted_professional', 'consent_granted_client', 'generation_requested', 'generation_succeeded', 'generation_failed', 'generation_blocked');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "ai_data_processing_consent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "ai_features_consent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ai_interaction_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT,
    "feature" "AiFeatureKey" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "context_ref" TEXT,
    "status" "AiInteractionStatus" NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "context_summary" JSONB NOT NULL,
    "response_text" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT,
    "feature" "AiFeatureKey",
    "action" "AiAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_interaction_logs_professional_id_created_at_idx" ON "ai_interaction_logs"("professional_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_client_id_idx" ON "ai_interaction_logs"("client_id");

-- CreateIndex
CREATE INDEX "ai_audit_logs_professional_id_created_at_idx" ON "ai_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
