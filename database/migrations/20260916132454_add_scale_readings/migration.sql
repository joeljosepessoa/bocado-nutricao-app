-- CreateEnum
CREATE TYPE "ScaleReadingStatus" AS ENUM ('confirmed', 'discarded');

-- CreateEnum
CREATE TYPE "ScaleAuditAction" AS ENUM ('reading_confirmed', 'reading_discarded', 'reading_listed');

-- CreateTable
CREATE TABLE "scale_readings" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "status" "ScaleReadingStatus" NOT NULL,
    "driver_id" TEXT NOT NULL,
    "device_identifier" TEXT NOT NULL,
    "protocol_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "normalized" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scale_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scale_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "evaluation_id" TEXT,
    "action" "ScaleAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scale_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scale_readings_idempotency_key_key" ON "scale_readings"("idempotency_key");

-- CreateIndex
CREATE INDEX "scale_readings_evaluation_id_idx" ON "scale_readings"("evaluation_id");

-- CreateIndex
CREATE INDEX "scale_readings_professional_id_created_at_idx" ON "scale_readings"("professional_id", "created_at");

-- CreateIndex
CREATE INDEX "scale_audit_logs_professional_id_created_at_idx" ON "scale_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "scale_readings" ADD CONSTRAINT "scale_readings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_readings" ADD CONSTRAINT "scale_readings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_readings" ADD CONSTRAINT "scale_readings_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_audit_logs" ADD CONSTRAINT "scale_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_audit_logs" ADD CONSTRAINT "scale_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_audit_logs" ADD CONSTRAINT "scale_audit_logs_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
