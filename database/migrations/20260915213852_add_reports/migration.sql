-- CreateEnum
CREATE TYPE "ReportAudience" AS ENUM ('professional', 'client');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('queued', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ReportAuditAction" AS ENUM ('created', 'generated', 'generation_failed', 'downloaded', 'released', 'revoked', 'deleted');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "audience" "ReportAudience" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'queued',
    "template_version" INTEGER NOT NULL,
    "data_snapshot" JSONB,
    "storage_key" TEXT,
    "size_bytes" INTEGER,
    "released_to_client_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "report_id" TEXT,
    "action" "ReportAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_client_id_created_at_idx" ON "reports"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_evaluation_id_idx" ON "reports"("evaluation_id");

-- CreateIndex
CREATE INDEX "report_audit_logs_report_id_idx" ON "report_audit_logs"("report_id");

-- CreateIndex
CREATE INDEX "report_audit_logs_professional_id_created_at_idx" ON "report_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_audit_logs" ADD CONSTRAINT "report_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_audit_logs" ADD CONSTRAINT "report_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_audit_logs" ADD CONSTRAINT "report_audit_logs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
