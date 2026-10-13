/**
 * Faixas de referência e classificação dos indicadores da avaliação física,
 * como aparecem no relatório ("Resultado / Avaliação / Referência").
 *
 * Só entra aqui regra publicada e conferida contra um laudo de referência
 * (homem, 39 anos, 195 cm, 107,7 kg — os números estão nos testes). Indicador
 * sem regra conferida fica sem classificação: o relatório mostra o resultado e
 * deixa a avaliação em branco, nunca um rótulo inventado. Ainda sem faixa:
 * gordura corporal, massa muscular, água corporal e massa óssea.
 */

export type Sex = 'male' | 'female';

export interface Assessment {
  /** Rótulo da coluna "Avaliação" (ex.: "Acima 12,6 kg"); null = sem regra aplicável. */
  classification: string | null;
  /** Texto da linha "Referência" (ex.: "70,3~95,1 kg"); null = sem faixa. */
  reference: string | null;
}

const NONE: Assessment = { classification: null, reference: null };

const round = (value: number, decimals: number): number => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** Número com vírgula decimal e casas fixas ("70,3"). */
export function formatFixed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Número como está, só trocando o ponto por vírgula ("107,7", "112"). */
export function formatPlain(value: number): string {
  return String(value).replace('.', ',');
}

const range = (min: number, max: number, decimals: number, unit: string) => `${formatFixed(min, decimals)}~${formatFixed(max, decimals)}${unit}`;

// --- Peso e IMC (OMS: IMC 18,5 a 25) -----------------------------------------

const BMI_MIN = 18.5;
const BMI_MAX = 25;

/** Faixa de peso que corresponde ao IMC 18,5–25 para a altura. */
export function referenceWeightRange(heightCm: number): { min: number; max: number } {
  const h2 = (heightCm / 100) ** 2;
  return { min: round(BMI_MIN * h2, 1), max: round(BMI_MAX * h2, 1) };
}

export function assessWeight(weightKg: number | null, heightCm: number | null): Assessment {
  if (weightKg == null || !heightCm) return NONE;
  const { min, max } = referenceWeightRange(heightCm);
  const classification =
    weightKg > max ? `Acima ${formatFixed(weightKg - max, 1)} kg` : weightKg < min ? `Abaixo ${formatFixed(min - weightKg, 1)} kg` : 'Normal';
  return { classification, reference: range(min, max, 1, ' kg') };
}

/** `detail` é a classificação da OMS já calculada (ex.: "sobrepeso"), mostrada junto. */
export function assessBmi(bmi: number | null, detail: string | null): Assessment {
  if (bmi == null) return NONE;
  const band = bmi >= BMI_MAX ? 'Acima' : bmi < BMI_MIN ? 'Abaixo' : 'Normal';
  const classification = detail && band !== 'Normal' ? `${band} (${detail})` : band;
  return { classification, reference: range(BMI_MIN, BMI_MAX, 1, ' kg/m²') };
}

// --- Músculo esquelético, % do peso (tabela Omron Healthcare, 18 a 80 anos) ----

/** [limite inferior do normal, limite superior do normal, limite superior do alto] */
const SKELETAL_MUSCLE_BANDS: Record<Sex, Array<{ maxAge: number; bands: [number, number, number] }>> = {
  male: [
    { maxAge: 39, bands: [33.3, 39.3, 44.0] },
    { maxAge: 59, bands: [33.1, 39.1, 43.8] },
    { maxAge: 80, bands: [32.9, 38.9, 43.6] },
  ],
  female: [
    { maxAge: 39, bands: [24.3, 30.3, 35.3] },
    { maxAge: 59, bands: [24.1, 30.1, 35.1] },
    { maxAge: 80, bands: [23.9, 29.9, 34.9] },
  ],
};

export function assessSkeletalMusclePercent(percent: number | null, sex: Sex | null, age: number | null): Assessment {
  if (percent == null || !sex || age == null || age < 18 || age > 80) return NONE;
  const [low, normalMax, highMax] = SKELETAL_MUSCLE_BANDS[sex].find((row) => age <= row.maxAge)!.bands;
  const classification = percent < low ? 'Abaixo' : percent <= normalMax ? 'Normal' : percent <= highMax ? 'Ótimo' : 'Excelente';
  return { classification, reference: range(low, normalMax, 1, ' %') };
}

// --- Gordura visceral (níveis Omron/Tanita) ------------------------------------

export function assessVisceralFat(level: number | null): Assessment {
  if (level == null) return NONE;
  const classification = level <= 9 ? 'Normal' : level <= 14 ? 'Acima' : 'Muito acima';
  return { classification, reference: '1~9' };
}

// --- Metabolismo basal: faixa pela fórmula escolhida, nos pesos de referência ---

export type BmrFormula = 'harris_benedict' | 'mifflin_st_jeor';

function basalRate(formula: BmrFormula, sex: Sex, weightKg: number, heightCm: number, age: number): number {
  if (formula === 'mifflin_st_jeor') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  }
  return sex === 'male'
    ? 66.47 + 13.75 * weightKg + 5.0 * heightCm - 6.76 * age
    : 655.1 + 9.56 * weightKg + 1.85 * heightCm - 4.68 * age;
}

/**
 * A faixa é o metabolismo calculado pela fórmula no menor e no maior peso de
 * referência (IMC 18,5 e 25) — é assim que o laudo de referência chega em
 * "1744~2085 kcal". Cunningham e Ten Haaf ainda não têm faixa conferida.
 */
export function assessBasalMetabolicRate(
  kcal: number | null,
  formula: string | null | undefined,
  sex: Sex | null,
  age: number | null,
  heightCm: number | null,
): Assessment {
  const chosen = formula ?? 'harris_benedict';
  if (kcal == null || !sex || age == null || !heightCm) return NONE;
  if (chosen !== 'harris_benedict' && chosen !== 'mifflin_st_jeor') return NONE;
  const weights = referenceWeightRange(heightCm);
  const min = Math.round(basalRate(chosen, sex, weights.min, heightCm, age));
  const max = Math.round(basalRate(chosen, sex, weights.max, heightCm, age));
  const classification = kcal < min ? 'Abaixo' : kcal > max ? 'Acima' : 'Normal';
  return { classification, reference: `${min}~${max} kcal` };
}

// --- Relação cintura/quadril: risco por sexo e idade ---------------------------

/** [fim do risco baixo, fim do moderado, fim do alto] — acima do último é muito alto. */
const WAIST_HIP_BANDS: Record<Sex, Array<{ maxAge: number; bands: [number, number, number] }>> = {
  male: [
    { maxAge: 29, bands: [0.83, 0.88, 0.94] },
    { maxAge: 39, bands: [0.84, 0.91, 0.96] },
    { maxAge: 49, bands: [0.88, 0.95, 1.0] },
    { maxAge: 59, bands: [0.9, 0.96, 1.02] },
    { maxAge: 69, bands: [0.91, 0.98, 1.03] },
  ],
  female: [
    { maxAge: 29, bands: [0.71, 0.77, 0.82] },
    { maxAge: 39, bands: [0.72, 0.78, 0.84] },
    { maxAge: 49, bands: [0.73, 0.79, 0.87] },
    { maxAge: 59, bands: [0.74, 0.81, 0.88] },
    { maxAge: 69, bands: [0.76, 0.83, 0.9] },
  ],
};

export function assessWaistHipRatio(ratio: number | null, sex: Sex | null, age: number | null): Assessment {
  if (ratio == null || !sex || age == null || age < 20 || age > 69) return NONE;
  const [lowEnd, moderateEnd, highEnd] = WAIST_HIP_BANDS[sex].find((row) => age <= row.maxAge)!.bands;
  const classification =
    ratio < lowEnd ? 'Risco Baixo' : ratio <= moderateEnd ? 'Risco Moderado' : ratio <= highEnd ? 'Risco Alto' : 'Risco Muito Alto';
  return { classification, reference: range(lowEnd, moderateEnd, 2, '') };
}

// --- Pressão arterial (Diretriz Brasileira de Hipertensão Arterial) -------------

export function assessBloodPressure(systolic: number | null, diastolic: number | null): Assessment {
  if (systolic == null || diastolic == null) return NONE;
  const classification =
    systolic >= 180 || diastolic >= 110
      ? 'Hipertensão estágio 3'
      : systolic >= 160 || diastolic >= 100
        ? 'Hipertensão estágio 2'
        : systolic >= 140 || diastolic >= 90
          ? 'Hipertensão estágio 1'
          : systolic >= 120 || diastolic >= 80
            ? 'Pré-hipertensão'
            : 'Normal';
  return { classification, reference: '120/80 mmHg' };
}

// --- Idade corporal -------------------------------------------------------------

/** Diferença para a idade real: "+1 ano(s)", "-3 ano(s)", "igual à idade real". */
export function bodyAgeDifference(bodyAgeYears: number | null, age: number | null): string | null {
  if (bodyAgeYears == null || age == null) return null;
  const diff = bodyAgeYears - age;
  if (diff === 0) return 'igual à idade real';
  return `${diff > 0 ? '+' : ''}${diff} ano(s)`;
}

// --- Composição derivada ---------------------------------------------------------

/** Massa residual (órgãos e vísceras) como fração do peso — Würch: 24,1% homens, 20,9% mulheres. */
const RESIDUAL_FRACTION: Record<Sex, number> = { male: 0.241, female: 0.209 };

export interface DerivedComposition {
  fatMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  skeletalMusclePercent: number | null;
  muscleMassKg: number | null;
  musclePercent: number | null;
  bodyWaterKg: number | null;
}

const percentOf = (massKg: number | null, weightKg: number | null) => (massKg == null || !weightKg ? null : round((massKg / weightKg) * 100, 1));

/**
 * Valor do aparelho quando foi digitado; senão, o que dá para tirar das medidas:
 *   massa muscular      = massa magra − massa óssea
 *   músculo esquelético = peso − gordura − massa óssea − massa residual
 * As duas contas precisam da massa óssea; sem ela (ou sem % de gordura) o campo fica vazio.
 */
export function deriveComposition(input: {
  sex: Sex | null;
  weightKg: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleMassKg: number | null;
  muscleMassKg: number | null;
  boneMassKg: number | null;
  bodyWaterPercent: number | null;
}): DerivedComposition {
  const { sex, weightKg, bodyFatPercent, boneMassKg } = input;
  const fatMassKg = weightKg != null && bodyFatPercent != null ? (weightKg * bodyFatPercent) / 100 : null;
  const canDerive = weightKg != null && fatMassKg != null && boneMassKg != null;

  const muscleMassKg = input.muscleMassKg ?? (canDerive ? round(weightKg - fatMassKg - boneMassKg, 1) : null);
  const skeletalMuscleMassKg =
    input.skeletalMuscleMassKg ?? (canDerive && sex ? round(weightKg - fatMassKg - boneMassKg - weightKg * RESIDUAL_FRACTION[sex], 1) : null);

  return {
    fatMassKg: fatMassKg == null ? null : round(fatMassKg, 1),
    skeletalMuscleMassKg,
    skeletalMusclePercent: percentOf(skeletalMuscleMassKg, weightKg),
    muscleMassKg,
    musclePercent: percentOf(muscleMassKg, weightKg),
    bodyWaterKg: weightKg != null && input.bodyWaterPercent != null ? round((weightKg * input.bodyWaterPercent) / 100, 1) : null,
  };
}
