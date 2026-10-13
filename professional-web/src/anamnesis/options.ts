import type { AnamnesisContent, AnamnesisView, SaveAnamnesisInput } from '../types/api';

/**
 * Etapas, opções e conversões da anamnese. Os CÓDIGOS das opções são os mesmos
 * do servidor (backend/src/anamnesis/anamnesis-options.ts); os rótulos ficam aqui.
 */

export interface Option {
  value: string;
  label: string;
}

export const STEPS = [
  { key: 'personal', label: 'Dados Pessoais' },
  { key: 'goal', label: 'Objetivo' },
  { key: 'clinical', label: 'Histórico Clínico' },
  { key: 'medications', label: 'Medicamentos' },
  { key: 'supplements', label: 'Suplementos' },
  { key: 'hormones', label: 'Hormônios' },
  { key: 'surgeries', label: 'Cirurgias & Alergias' },
  { key: 'family', label: 'Histórico Familiar' },
  { key: 'habits', label: 'Hábitos' },
  { key: 'activity', label: 'Atividade Física' },
  { key: 'food', label: 'Alimentação' },
  { key: 'notes', label: 'Observações' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export const GOAL_OPTIONS: Option[] = [
  { value: 'weight_loss', label: 'Emagrecimento' },
  { value: 'hypertrophy', label: 'Hipertrofia' },
  { value: 'weight_gain', label: 'Ganho de peso' },
  { value: 'sports_performance', label: 'Performance esportiva' },
  { value: 'health', label: 'Saúde' },
  { value: 'dietary_reeducation', label: 'Reeducação alimentar' },
  { value: 'fat_reduction', label: 'Redução de gordura' },
  { value: 'competition_prep', label: 'Preparação para competição' },
  { value: 'other', label: 'Outro' },
];

export const CONDITION_OPTIONS: Option[] = [
  { value: 'hypertension', label: 'Hipertensão' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'dyslipidemia', label: 'Dislipidemia' },
  { value: 'hypothyroidism', label: 'Hipotireoidismo' },
  { value: 'hyperthyroidism', label: 'Hipertireoidismo' },
  { value: 'insulin_resistance', label: 'Resistência à insulina' },
  { value: 'pcos', label: 'SOP' },
  { value: 'gastritis', label: 'Gastrite' },
  { value: 'reflux', label: 'Refluxo' },
  { value: 'kidney_disease', label: 'Doença renal' },
  { value: 'liver_disease', label: 'Doença hepática' },
  { value: 'heart_disease', label: 'Cardiopatias' },
  { value: 'anxiety', label: 'Ansiedade' },
  { value: 'depression', label: 'Depressão' },
];

export const FAMILY_HISTORY_OPTIONS: Option[] = [
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hypertension', label: 'Hipertensão' },
  { value: 'obesity', label: 'Obesidade' },
  { value: 'heart_attack', label: 'Infarto' },
  { value: 'stroke', label: 'AVC' },
  { value: 'cancer', label: 'Câncer' },
];

export const GENDER_OPTIONS: Option[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
];

export const SLEEP_QUALITY_OPTIONS: Option[] = [
  { value: 'great', label: 'Ótima' },
  { value: 'good', label: 'Boa' },
  { value: 'regular', label: 'Regular' },
  { value: 'poor', label: 'Ruim' },
  { value: 'very_poor', label: 'Péssima' },
];

export const STRESS_LEVEL_OPTIONS: Option[] = [
  { value: 'low', label: 'Baixo' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'high', label: 'Alto' },
  { value: 'very_high', label: 'Muito alto' },
];

/** Linha de medicamento/suplemento/hormônio enquanto é digitada. */
export interface ItemForm {
  key: string;
  name: string;
  dosage: string;
  frequency: string;
}

type TextKey = {
  [K in keyof AnamnesisContent]: AnamnesisContent[K] extends string | null ? K : never;
}[keyof AnamnesisContent];

/** A ficha como está nos campos da tela: texto nunca é null, listas com chave de linha. */
export type AnamnesisForm = Record<TextKey, string> & {
  birthDate: string;
  gender: string;
  phone: string;
  goals: string[];
  conditions: string[];
  familyHistory: string[];
  medications: ItemForm[];
  supplements: ItemForm[];
  hormones: ItemForm[];
};

export const TEXT_KEYS: TextKey[] = [
  'maritalStatus',
  'cpf',
  'rg',
  'occupation',
  'address',
  'goalDescription',
  'otherConditions',
  'surgeries',
  'allergies',
  'smoking',
  'alcohol',
  'waterIntake',
  'sleepHours',
  'sleepQuality',
  'stressLevel',
  'bowelFrequency',
  'trainingFrequency',
  'trainingDuration',
  'trainingModality',
  'cardio',
  'dailySteps',
  'mealsPerDay',
  'mealTimes',
  'foodPreferences',
  'intolerances',
  'restrictions',
  'aversions',
  'notes',
];

let sequence = 0;
export const emptyItem = (): ItemForm => ({ key: `item-${++sequence}`, name: '', dosage: '', frequency: '' });

const toItemForms = (items: AnamnesisContent['medications']): ItemForm[] =>
  items.map((item) => ({ key: `item-${++sequence}`, name: item.name, dosage: item.dosage ?? '', frequency: item.frequency ?? '' }));

export function toForm(view: AnamnesisView): AnamnesisForm {
  const { anamnesis, client } = view;
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, anamnesis[key] ?? ''])) as Record<TextKey, string>;
  return {
    ...text,
    birthDate: client.birthDate ?? '',
    gender: GENDER_OPTIONS.some((option) => option.value === (client.gender ?? '').trim().toLowerCase()) ? (client.gender as string).trim().toLowerCase() : '',
    phone: client.phone ?? '',
    goals: [...anamnesis.goals],
    conditions: [...anamnesis.conditions],
    familyHistory: [...anamnesis.familyHistory],
    medications: toItemForms(anamnesis.medications),
    supplements: toItemForms(anamnesis.supplements),
    hormones: toItemForms(anamnesis.hormones),
  };
}

const blank = (value: string) => (value.trim() ? value.trim() : null);

/** Linha sem nome não é enviada (o profissional abriu a linha e não preencheu). */
const toItems = (items: ItemForm[]) =>
  items.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), dosage: blank(item.dosage), frequency: blank(item.frequency) }));

export function toPayload(form: AnamnesisForm, completed?: boolean): SaveAnamnesisInput {
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, blank(form[key])])) as Record<TextKey, string | null>;
  return {
    ...text,
    birthDate: form.birthDate || null,
    gender: form.gender || null,
    phone: blank(form.phone),
    goals: form.goals,
    conditions: form.conditions,
    familyHistory: form.familyHistory,
    medications: toItems(form.medications),
    supplements: toItems(form.supplements),
    hormones: toItems(form.hormones),
    ...(completed === undefined ? {} : { completed }),
  };
}

export interface SummaryRow {
  label: string;
  value: string;
  /** O que não pode passar despercebido na consulta (patologias e alergias). */
  alert?: boolean;
}

const labelsOf = (codes: string[], options: Option[]) => options.filter((option) => codes.includes(option.value)).map((option) => option.label);

const itemsText = (items: AnamnesisContent['medications']) =>
  items.map((item) => {
    const detail = [item.dosage, item.frequency].filter(Boolean).join(', ');
    return detail ? `${item.name} (${detail})` : item.name;
  });

const joined = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' — ');

/**
 * O que importa na consulta, tirado da ficha como foi preenchida — sem
 * interpretação: só as linhas que têm conteúdo, na ordem em que o profissional
 * costuma precisar delas.
 */
export function summaryRows(anamnesis: AnamnesisContent): SummaryRow[] {
  const rows: SummaryRow[] = [
    { label: 'Objetivo', value: joined(labelsOf(anamnesis.goals, GOAL_OPTIONS).join(', '), anamnesis.goalDescription) },
    { label: 'Patologias', value: joined(labelsOf(anamnesis.conditions, CONDITION_OPTIONS).join(', '), anamnesis.otherConditions), alert: true },
    { label: 'Alergias', value: joined(anamnesis.allergies), alert: true },
    { label: 'Medicamentos', value: itemsText(anamnesis.medications).join('; ') },
    { label: 'Suplementos', value: itemsText(anamnesis.supplements).join('; ') },
    { label: 'Hormônios', value: itemsText(anamnesis.hormones).join('; ') },
    { label: 'Intolerâncias', value: joined(anamnesis.intolerances) },
    { label: 'Restrições', value: joined(anamnesis.restrictions) },
    { label: 'Aversões', value: joined(anamnesis.aversions) },
    { label: 'Cirurgias', value: joined(anamnesis.surgeries) },
    { label: 'Histórico familiar', value: labelsOf(anamnesis.familyHistory, FAMILY_HISTORY_OPTIONS).join(', ') },
  ];
  return rows.filter((row) => row.value !== '');
}

/** Etapa com alguma coisa preenchida — é o que acende o "✓" na barra de etapas. */
export function stepHasContent(step: StepKey, form: AnamnesisForm): boolean {
  const any = (...values: string[]) => values.some((value) => value.trim() !== '');
  switch (step) {
    case 'personal':
      return any(form.birthDate, form.gender, form.phone, form.maritalStatus, form.cpf, form.rg, form.occupation, form.address);
    case 'goal':
      return form.goals.length > 0 || any(form.goalDescription);
    case 'clinical':
      return form.conditions.length > 0 || any(form.otherConditions);
    case 'medications':
      return form.medications.some((item) => item.name.trim());
    case 'supplements':
      return form.supplements.some((item) => item.name.trim());
    case 'hormones':
      return form.hormones.some((item) => item.name.trim());
    case 'surgeries':
      return any(form.surgeries, form.allergies);
    case 'family':
      return form.familyHistory.length > 0;
    case 'habits':
      return any(form.smoking, form.alcohol, form.waterIntake, form.sleepHours, form.sleepQuality, form.stressLevel, form.bowelFrequency);
    case 'activity':
      return any(form.trainingFrequency, form.trainingDuration, form.trainingModality, form.cardio, form.dailySteps);
    case 'food':
      return any(form.mealsPerDay, form.mealTimes, form.foodPreferences, form.intolerances, form.restrictions, form.aversions);
    case 'notes':
      return any(form.notes);
  }
}
