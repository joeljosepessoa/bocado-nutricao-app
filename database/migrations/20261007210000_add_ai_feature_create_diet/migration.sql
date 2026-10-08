-- E3: modo "Deixar a IA montar" do Assistente de Dieta. Só acrescenta um valor
-- ao enum (aditivo; nenhuma linha existente muda).
-- AlterEnum
ALTER TYPE "AiFeatureKey" ADD VALUE 'create_diet';
