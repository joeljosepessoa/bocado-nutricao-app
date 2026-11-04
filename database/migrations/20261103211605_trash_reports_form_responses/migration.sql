-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportAuditAction" ADD VALUE 'restored';
ALTER TYPE "ReportAuditAction" ADD VALUE 'purged';

-- AlterTable
ALTER TABLE "custom_form_responses" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "deleted_at" TIMESTAMP(3);
