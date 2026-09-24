/**
 * Limites de sanidade de um treino montado de uma vez (saída da IA e
 * criação de rascunho a partir de proposta). Não restringem o CRUD
 * granular já existente — só as duas entradas em lote.
 */
export const WORKOUT_LIMITS = {
  maxDays: 14,
  maxExercisesPerDay: 40,
  maxSetsPerExercise: 30,
  maxNameLength: 200,
  maxNotesLength: 1000,
  maxTempoLength: 50,
  maxReps: 1000,
  maxRestSeconds: 3600,
  maxDurationSeconds: 14400,
  maxDistanceMeters: 100000,
  maxLoadValue: 2000,
} as const;
