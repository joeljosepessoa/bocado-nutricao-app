/**
 * Opções das caixas de marcar e das listas da anamnese. O banco guarda os
 * CÓDIGOS; os rótulos em português ficam no painel (anamnesis/options.ts) —
 * as duas listas precisam ter os mesmos códigos.
 */
export const ANAMNESIS_GOALS = [
  'weight_loss',
  'hypertrophy',
  'weight_gain',
  'sports_performance',
  'health',
  'dietary_reeducation',
  'fat_reduction',
  'competition_prep',
  'other',
] as const;

export const ANAMNESIS_CONDITIONS = [
  'hypertension',
  'diabetes',
  'dyslipidemia',
  'hypothyroidism',
  'hyperthyroidism',
  'insulin_resistance',
  'pcos',
  'gastritis',
  'reflux',
  'kidney_disease',
  'liver_disease',
  'heart_disease',
  'anxiety',
  'depression',
] as const;

export const ANAMNESIS_FAMILY_HISTORY = ['diabetes', 'hypertension', 'obesity', 'heart_attack', 'stroke', 'cancer'] as const;

export const ANAMNESIS_SLEEP_QUALITY = ['great', 'good', 'regular', 'poor', 'very_poor'] as const;

export const ANAMNESIS_STRESS_LEVEL = ['low', 'moderate', 'high', 'very_high'] as const;

/** Como o cadastro do paciente já guarda o sexo (`Client.gender`). */
export const ANAMNESIS_GENDERS = ['masculino', 'feminino', 'outro'] as const;

export const ANAMNESIS_LIMITS = {
  shortText: 200,
  longText: 2000,
  listItems: 30,
} as const;
