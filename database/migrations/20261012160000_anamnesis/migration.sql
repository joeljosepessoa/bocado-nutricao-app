-- Anamnese: ficha do paciente em 12 etapas, preenchida pelo profissional, e o
-- registro de quem abriu/alterou. Só cria tabelas novas; nenhum dado existente muda.

-- CreateEnum
CREATE TYPE "AnamnesisAuditAction" AS ENUM ('read', 'saved', 'completed');

-- CreateTable
CREATE TABLE "anamneses" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "marital_status" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goal_description" TEXT,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "other_conditions" TEXT,
    "medications" JSONB NOT NULL DEFAULT '[]',
    "supplements" JSONB NOT NULL DEFAULT '[]',
    "hormones" JSONB NOT NULL DEFAULT '[]',
    "surgeries" TEXT,
    "allergies" TEXT,
    "family_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "smoking" TEXT,
    "alcohol" TEXT,
    "water_intake" TEXT,
    "sleep_hours" TEXT,
    "sleep_quality" TEXT,
    "stress_level" TEXT,
    "bowel_frequency" TEXT,
    "training_frequency" TEXT,
    "training_duration" TEXT,
    "training_modality" TEXT,
    "cardio" TEXT,
    "daily_steps" TEXT,
    "meals_per_day" TEXT,
    "meal_times" TEXT,
    "food_preferences" TEXT,
    "intolerances" TEXT,
    "restrictions" TEXT,
    "aversions" TEXT,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamnesis_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "action" "AnamnesisAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anamnesis_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anamneses_client_id_key" ON "anamneses"("client_id");

-- CreateIndex
CREATE INDEX "anamneses_professional_id_idx" ON "anamneses"("professional_id");

-- CreateIndex
CREATE INDEX "anamnesis_audit_logs_client_id_created_at_idx" ON "anamnesis_audit_logs"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "anamnesis_audit_logs_professional_id_created_at_idx" ON "anamnesis_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_audit_logs" ADD CONSTRAINT "anamnesis_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

