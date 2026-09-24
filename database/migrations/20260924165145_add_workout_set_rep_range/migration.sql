-- Faixa de repetições prescrita ("6-10"). Aditiva: colunas novas nullable,
-- sem DEFAULT e sem backfill — séries existentes continuam só com `reps`.
-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "reps_max" INTEGER,
ADD COLUMN     "reps_min" INTEGER;
