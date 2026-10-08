/**
 * Metas do paciente preenchidas na ficha (Meta de peso e Meta de água).
 * Campos vazios viram null (sem meta); aceita vírgula decimal no peso.
 */
export function parseGoals(
  targetWeight: string,
  waterGoal: string,
): { targetWeightKg: number | null; waterGoalMl: number | null } | { error: string } {
  const weightText = targetWeight.trim().replace(',', '.');
  const waterText = waterGoal.trim();
  const targetWeightKg = weightText === '' ? null : Number(weightText);
  const waterGoalMl = waterText === '' ? null : Number(waterText);
  if (targetWeightKg !== null && (!Number.isFinite(targetWeightKg) || targetWeightKg < 20 || targetWeightKg > 400)) {
    return { error: 'Meta de peso deve ficar entre 20 e 400 kg.' };
  }
  if (waterGoalMl !== null && (!Number.isInteger(waterGoalMl) || waterGoalMl < 500 || waterGoalMl > 10000)) {
    return { error: 'Meta de água deve ser um número inteiro entre 500 e 10000 ml.' };
  }
  return { targetWeightKg: targetWeightKg === null ? null : Math.round(targetWeightKg * 10) / 10, waterGoalMl };
}
