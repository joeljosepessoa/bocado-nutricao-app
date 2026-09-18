-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClientBillingAuditAction" ADD VALUE 'product_created';
ALTER TYPE "ClientBillingAuditAction" ADD VALUE 'product_updated';
ALTER TYPE "ClientBillingAuditAction" ADD VALUE 'product_deactivated';
ALTER TYPE "ClientBillingAuditAction" ADD VALUE 'link_canceled';
ALTER TYPE "ClientBillingAuditAction" ADD VALUE 'link_expired';
