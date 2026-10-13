import {
  assessBasalMetabolicRate,
  assessBloodPressure,
  assessBmi,
  assessSkeletalMusclePercent,
  assessVisceralFat,
  assessWaistHipRatio,
  assessWeight,
  bodyAgeDifference,
  deriveComposition,
  referenceWeightRange,
} from './evaluation-references';

/**
 * Laudo de referência (outro sistema, método 7 dobras): homem, 39 anos,
 * 195 cm, 107,7 kg, 24,5% de gordura, massa óssea 5,03 kg, cintura/quadril
 * 0,97, metabolismo basal 2075 kcal, gordura visceral 11, pressão 130/80.
 * Cada expectativa abaixo é um número ou rótulo impresso naquele laudo.
 */
describe('referências da avaliação — conferência com o laudo de referência', () => {
  it('peso: faixa pelo IMC 18,5–25 e o excesso em kg', () => {
    expect(referenceWeightRange(195)).toEqual({ min: 70.3, max: 95.1 });
    expect(assessWeight(107.7, 195)).toEqual({ classification: 'Acima 12,6 kg', reference: '70,3~95,1 kg' });
  });

  it('IMC', () => {
    expect(assessBmi(28.3, 'sobrepeso')).toEqual({ classification: 'Acima (sobrepeso)', reference: '18,5~25,0 kg/m²' });
  });

  it('músculo esquelético e massa muscular saem das medidas quando o aparelho não os deu', () => {
    const derived = deriveComposition({
      sex: 'male',
      weightKg: 107.7,
      bodyFatPercent: 24.5,
      skeletalMuscleMassKg: null,
      muscleMassKg: null,
      boneMassKg: 5.03,
      bodyWaterPercent: 57.9,
    });
    expect(derived).toEqual({
      fatMassKg: 26.4,
      skeletalMuscleMassKg: 50.3,
      skeletalMusclePercent: 46.7,
      muscleMassKg: 76.3,
      musclePercent: 70.8,
      bodyWaterKg: 62.4,
    });
    expect(assessSkeletalMusclePercent(derived.skeletalMusclePercent, 'male', 39)).toEqual({ classification: 'Excelente', reference: '33,3~39,3 %' });
  });

  it('gordura visceral, metabolismo basal (Harris-Benedict) e cintura/quadril', () => {
    expect(assessVisceralFat(11)).toEqual({ classification: 'Acima', reference: '1~9' });
    expect(assessBasalMetabolicRate(2075, 'harris_benedict', 'male', 39, 195)).toEqual({ classification: 'Normal', reference: '1744~2085 kcal' });
    expect(assessWaistHipRatio(0.97, 'male', 39)).toEqual({ classification: 'Risco Muito Alto', reference: '0,84~0,91' });
  });

  it('idade corporal e pressão arterial', () => {
    expect(bodyAgeDifference(40, 39)).toBe('+1 ano(s)');
    expect(assessBloodPressure(130, 80)).toEqual({ classification: 'Pré-hipertensão', reference: '120/80 mmHg' });
  });
});

describe('referências da avaliação — regras', () => {
  it('peso dentro e abaixo da faixa', () => {
    expect(assessWeight(80, 195).classification).toBe('Normal');
    expect(assessWeight(65.3, 195).classification).toBe('Abaixo 5,0 kg');
  });

  it('IMC normal não repete a classificação', () => {
    expect(assessBmi(22, 'peso normal').classification).toBe('Normal');
    expect(assessBmi(17.9, 'abaixo do peso').classification).toBe('Abaixo (abaixo do peso)');
  });

  it('músculo esquelético: faixas por sexo e idade', () => {
    expect(assessSkeletalMusclePercent(24.2, 'female', 38)).toEqual({ classification: 'Abaixo', reference: '24,3~30,3 %' });
    expect(assessSkeletalMusclePercent(30.3, 'female', 38).classification).toBe('Normal');
    expect(assessSkeletalMusclePercent(35.3, 'female', 38).classification).toBe('Ótimo');
    expect(assessSkeletalMusclePercent(35.4, 'female', 38).classification).toBe('Excelente');
    expect(assessSkeletalMusclePercent(39.1, 'male', 45)).toEqual({ classification: 'Normal', reference: '33,1~39,1 %' });
    expect(assessSkeletalMusclePercent(30, 'female', 65).reference).toBe('23,9~29,9 %');
  });

  it('valor do aparelho tem preferência sobre a conta', () => {
    const derived = deriveComposition({
      sex: 'female',
      weightKg: 64.1,
      bodyFatPercent: 23.6,
      skeletalMuscleMassKg: 22.69,
      muscleMassKg: 38.6,
      boneMassKg: 2.8,
      bodyWaterPercent: 47.3,
    });
    expect(derived.skeletalMuscleMassKg).toBe(22.69);
    expect(derived.skeletalMusclePercent).toBe(35.4);
    expect(derived.muscleMassKg).toBe(38.6);
    expect(derived.musclePercent).toBe(60.2);
    expect(derived.bodyWaterKg).toBe(30.3);
  });

  it('sem massa óssea ou sem % de gordura não há o que derivar', () => {
    const base = { sex: 'male' as const, weightKg: 80, skeletalMuscleMassKg: null, muscleMassKg: null, bodyWaterPercent: null };
    expect(deriveComposition({ ...base, bodyFatPercent: 20, boneMassKg: null })).toMatchObject({ skeletalMuscleMassKg: null, muscleMassKg: null });
    expect(deriveComposition({ ...base, bodyFatPercent: null, boneMassKg: 3 })).toMatchObject({ fatMassKg: null, skeletalMuscleMassKg: null, muscleMassKg: null });
    // Sem o sexo não há fração residual: a massa muscular sai, o músculo esquelético não.
    expect(deriveComposition({ ...base, sex: null, bodyFatPercent: 20, boneMassKg: 3 })).toMatchObject({ skeletalMuscleMassKg: null, muscleMassKg: 61 });
  });

  it('metabolismo basal: Mifflin-St. Jeor tem faixa; Cunningham e Ten Haaf ainda não', () => {
    // mulher, 38 anos, 156,5 cm → pesos de referência 45,3 e 61,2 kg
    expect(referenceWeightRange(156.5)).toEqual({ min: 45.3, max: 61.2 });
    // 10 × peso + 6,25 × 156,5 − 5 × 38 − 161 → 1080 e 1239 kcal
    expect(assessBasalMetabolicRate(1264, 'mifflin_st_jeor', 'female', 38, 156.5)).toEqual({ classification: 'Acima', reference: '1080~1239 kcal' });
    expect(assessBasalMetabolicRate(1100, 'mifflin_st_jeor', 'female', 38, 156.5).classification).toBe('Normal');
    expect(assessBasalMetabolicRate(1264, 'cunningham', 'female', 38, 156.5)).toEqual({ classification: null, reference: null });
    expect(assessBasalMetabolicRate(1264, null, 'female', 38, 156.5).reference).toMatch(/kcal$/); // sem escolha: Harris-Benedict
  });

  it('cintura/quadril: risco por faixa; fora de 20–69 anos não classifica', () => {
    expect(assessWaistHipRatio(0.69, 'female', 38)).toEqual({ classification: 'Risco Baixo', reference: '0,72~0,78' });
    expect(assessWaistHipRatio(0.78, 'female', 38).classification).toBe('Risco Moderado');
    expect(assessWaistHipRatio(0.84, 'female', 38).classification).toBe('Risco Alto');
    expect(assessWaistHipRatio(0.9, 'male', 75)).toEqual({ classification: null, reference: null });
  });

  it('pressão arterial: vale o pior dos dois números', () => {
    expect(assessBloodPressure(115, 75).classification).toBe('Normal');
    expect(assessBloodPressure(118, 92).classification).toBe('Hipertensão estágio 1');
    expect(assessBloodPressure(165, 85).classification).toBe('Hipertensão estágio 2');
    expect(assessBloodPressure(185, 85).classification).toBe('Hipertensão estágio 3');
    expect(assessBloodPressure(120, null)).toEqual({ classification: null, reference: null });
  });

  it('sem dado ou sem sexo/idade: sem classificação, nunca um rótulo inventado', () => {
    expect(assessWeight(null, 195)).toEqual({ classification: null, reference: null });
    expect(assessSkeletalMusclePercent(40, null, 39)).toEqual({ classification: null, reference: null });
    expect(assessSkeletalMusclePercent(40, 'male', 16)).toEqual({ classification: null, reference: null });
    expect(assessVisceralFat(null)).toEqual({ classification: null, reference: null });
    expect(bodyAgeDifference(null, 39)).toBeNull();
    expect(bodyAgeDifference(39, 39)).toBe('igual à idade real');
    expect(bodyAgeDifference(36, 39)).toBe('-3 ano(s)');
  });
});
