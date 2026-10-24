-- Conversa com a IA dentro do paciente (dieta e treino): dois tipos novos no
-- registro de uso da IA. Só acrescenta valores ao tipo; nenhuma linha muda.
ALTER TYPE "AiFeatureKey" ADD VALUE 'patient_diet_chat';
ALTER TYPE "AiFeatureKey" ADD VALUE 'patient_workout_chat';
