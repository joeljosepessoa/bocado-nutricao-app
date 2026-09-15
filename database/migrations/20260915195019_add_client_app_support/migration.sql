-- AlterEnum
ALTER TYPE "EvaluationAuditAction" ADD VALUE 'released';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privacy_accepted_at" TIMESTAMP(3);
