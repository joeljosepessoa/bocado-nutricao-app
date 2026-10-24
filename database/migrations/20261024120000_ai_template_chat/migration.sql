-- Conversa com a IA nos Modelos (dieta e treino sem paciente): dois tipos novos
-- no registro de uso da IA. Só acrescenta valores ao tipo; nenhuma linha muda.
ALTER TYPE "AiFeatureKey" ADD VALUE 'template_diet_chat';
ALTER TYPE "AiFeatureKey" ADD VALUE 'template_workout_chat';
