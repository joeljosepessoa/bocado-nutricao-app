-- Autorização de IA dada pelo paciente fora do app e registrada pelo profissional no painel.
ALTER TYPE "AiAuditAction" ADD VALUE 'consent_recorded_by_professional';
ALTER TABLE "ai_audit_logs" ADD COLUMN "consent_method" TEXT;
