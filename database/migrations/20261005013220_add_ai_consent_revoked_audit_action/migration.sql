-- Revogação do consentimento de IA pelo cliente passa a ser auditada.
-- Aditiva: só um valor novo no enum; nada existente muda.
-- AlterEnum
ALTER TYPE "AiAuditAction" ADD VALUE 'consent_revoked_client';
