-- Registra em cada interação de IA qual política por recurso a liberou
-- (consentimento do cliente x só material do profissional). Aditiva:
-- tipo novo + coluna nula; interações antigas ficam com NULL.
-- CreateEnum
CREATE TYPE "AiProcessingPolicy" AS ENUM ('client_consent', 'professional_material');

-- AlterTable
ALTER TABLE "ai_interaction_logs" ADD COLUMN     "processing_policy" "AiProcessingPolicy";
