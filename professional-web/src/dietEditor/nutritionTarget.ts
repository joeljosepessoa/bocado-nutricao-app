/**
 * Meta nutricional da dieta: metabolismo basal (TMB) pela fórmula escolhida,
 * gasto do dia (TMB × nível de atividade), ajuste do objetivo e divisão em
 * proteína/gordura por kg — o carboidrato fica com o restante das kcal.
 * Só calcula; quem decide e salva a meta é o profissional.
 */

export type BmrFormula = 'harris_benedict' | 'mifflin_st_jeor';
export type Sex = 'male' | 'female';

export const BMR_FORMULAS: Array<{ value: BmrFormula; label: string }> = [
  { value: 'mifflin_st_jeor', label: 'Mifflin-St. Jeor' },
  { value: 'harris_benedict', label: 'Harris-Benedict' },
];

export const ACTIVITY_LEVELS: Array<{ factor: number; label: string }> = [
  { factor: 1.2, label: 'Sedentário — pouca ou nenhuma atividade' },
  { factor: 1.375, label: 'Levemente ativo — 1 a 3 dias por semana' },
  { factor: 1.55, label: 'Moderadamente ativo — 3 a 5 dias por semana' },
  { factor: 1.725, label: 'Muito ativo — 6 a 7 dias por semana' },
  { factor: 1.9, label: 'Extremamente ativo — 2 treinos por dia ou trabalho físico' },
];

/** Ajuste sobre o gasto do dia: déficit para perder, superávit para ganhar. */
export const OBJECTIVE_ADJUSTMENTS: Array<{ percent: number; label: string }> = [
  { percent: -25, label: 'Déficit de 25%' },
  { percent: -20, label: 'Déficit de 20%' },
  { percent: -15, label: 'Déficit de 15%' },
  { percent: -10, label: 'Déficit de 10%' },
  { percent: 0, label: 'Manutenção' },
  { percent: 5, label: 'Superávit de 5%' },
  { percent: 10, label: 'Superávit de 10%' },
  { percent: 15, label: 'Superávit de 15%' },
  { percent: 20, label: 'Superávit de 20%' },
];

/** Mesmas fórmulas usadas nas faixas do relatório da avaliação física. */
export function basalMetabolicRate(formula: BmrFormula, sex: Sex, weightKg: number, heightCm: number, age: number): number {
  if (formula === 'mifflin_st_jeor') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  }
  return sex === 'male' ? 66.47 + 13.75 * weightKg + 5.0 * heightCm - 6.76 * age : 655.1 + 9.56 * weightKg + 1.85 * heightCm - 4.68 * age;
}

export interface TargetInput {
  formula: BmrFormula;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityFactor: number;
  objectivePercent: number;
  proteinGPerKg: number;
  fatGPerKg: number;
}

export interface TargetResult {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** Proteína e gordura já passam das kcal da meta — o carboidrato ficaria negativo. */
  carbWouldBeNegative: boolean;
}

export function computeTarget(input: TargetInput): TargetResult {
  const bmr = basalMetabolicRate(input.formula, input.sex, input.weightKg, input.heightCm, input.age);
  const tdee = bmr * input.activityFactor;
  const kcal = Math.round(tdee * (1 + input.objectivePercent / 100));
  const proteinG = Math.round(input.proteinGPerKg * input.weightKg);
  const fatG = Math.round(input.fatGPerKg * input.weightKg);
  const carbKcal = kcal - proteinG * 4 - fatG * 9;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    proteinG,
    fatG,
    carbG: Math.max(0, Math.round(carbKcal / 4)),
    carbWouldBeNegative: carbKcal < 0,
  };
}

/** Idade completa numa data (nascimento "AAAA-MM-DD…"). */
export function ageAt(birthDate: string | null | undefined, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const age = at.getFullYear() - y - (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d) ? 1 : 0);
  return age >= 0 ? age : null;
}

export function sexFromText(value: string | null | undefined): Sex | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'male' || v === 'masculino') return 'male';
  if (v === 'female' || v === 'feminino') return 'female';
  return null;
}

/** Diferença do plano para a meta (−0,07 = 7% abaixo); null sem meta. */
export function differenceFromTarget(value: number, target: number | null | undefined): number | null {
  if (!target || target <= 0) return null;
  return (value - target) / target;
}
