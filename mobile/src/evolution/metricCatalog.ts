import type { EvolutionEntry } from '../types/api';

export interface MetricDescriptor {
  key: string;
  label: string;
  unit: string;
  accessor: (entry: EvolutionEntry) => number | null;
}

/** Sempre disponíveis (peso/altura) ou vindo de dobras/bioimpedância já resolvidas no backend. */
export const PRIMARY_METRICS: MetricDescriptor[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', accessor: (e) => e.weightKg },
  { key: 'bodyFatPercent', label: '% de gordura', unit: '%', accessor: (e) => e.bodyFatPercent },
  { key: 'leanMassKg', label: 'Massa magra', unit: 'kg', accessor: (e) => e.leanMassKg },
  { key: 'fatMassKg', label: 'Massa gorda', unit: 'kg', accessor: (e) => e.fatMassKg },
  { key: 'bmi', label: 'IMC', unit: '', accessor: (e) => e.bmi },
];

/** As circunferências do schema — todas, nenhuma inventada. */
export const MEASUREMENT_METRICS: MetricDescriptor[] = [
  { key: 'waistCm', label: 'Cintura', unit: 'cm', accessor: (e) => e.measurements?.waistCm ?? null },
  { key: 'abdomenCm', label: 'Abdômen', unit: 'cm', accessor: (e) => e.measurements?.abdomenCm ?? null },
  { key: 'hipCm', label: 'Quadril', unit: 'cm', accessor: (e) => e.measurements?.hipCm ?? null },
  { key: 'chestCm', label: 'Tórax', unit: 'cm', accessor: (e) => e.measurements?.chestCm ?? null },
  { key: 'armRightCm', label: 'Braço direito', unit: 'cm', accessor: (e) => e.measurements?.armRightCm ?? null },
  { key: 'armLeftCm', label: 'Braço esquerdo', unit: 'cm', accessor: (e) => e.measurements?.armLeftCm ?? null },
  {
    key: 'forearmRightCm',
    label: 'Antebraço direito',
    unit: 'cm',
    accessor: (e) => e.measurements?.forearmRightCm ?? null,
  },
  {
    key: 'forearmLeftCm',
    label: 'Antebraço esquerdo',
    unit: 'cm',
    accessor: (e) => e.measurements?.forearmLeftCm ?? null,
  },
  { key: 'thighRightCm', label: 'Coxa direita', unit: 'cm', accessor: (e) => e.measurements?.thighRightCm ?? null },
  {
    key: 'thighLeftCm',
    label: 'Coxa esquerda',
    unit: 'cm',
    accessor: (e) => e.measurements?.thighLeftCm ?? null,
  },
  {
    key: 'calfRightCm',
    label: 'Panturrilha direita',
    unit: 'cm',
    accessor: (e) => e.measurements?.calfRightCm ?? null,
  },
  {
    key: 'calfLeftCm',
    label: 'Panturrilha esquerda',
    unit: 'cm',
    accessor: (e) => e.measurements?.calfLeftCm ?? null,
  },
  { key: 'wristCm', label: 'Punho', unit: 'cm', accessor: (e) => e.measurements?.wristCm ?? null },
  {
    key: 'femurBicondylarCm',
    label: 'Fêmur (bicondilar)',
    unit: 'cm',
    accessor: (e) => e.measurements?.femurBicondylarCm ?? null,
  },
];

/** Resultados de bioimpedância — só quando a avaliação liberada tinha bioimpedância registrada. */
export const COMPOSITION_METRICS: MetricDescriptor[] = [
  { key: 'muscleMassKg', label: 'Massa muscular', unit: 'kg', accessor: (e) => e.composition?.muscleMassKg ?? null },
  {
    key: 'bodyWaterPercent',
    label: 'Água corporal',
    unit: '%',
    accessor: (e) => e.composition?.bodyWaterPercent ?? null,
  },
  {
    key: 'visceralFatLevel',
    label: 'Gordura visceral',
    unit: '',
    accessor: (e) => e.composition?.visceralFatLevel ?? null,
  },
  { key: 'boneMassKg', label: 'Massa óssea', unit: 'kg', accessor: (e) => e.composition?.boneMassKg ?? null },
  {
    key: 'basalMetabolicRateKcal',
    label: 'Metabolismo basal',
    unit: 'kcal',
    accessor: (e) => e.composition?.basalMetabolicRateKcal ?? null,
  },
  {
    key: 'bodyAgeYears',
    label: 'Idade corporal',
    unit: 'anos',
    accessor: (e) => e.composition?.bodyAgeYears ?? null,
  },
];

export const ALL_METRICS: MetricDescriptor[] = [...PRIMARY_METRICS, ...MEASUREMENT_METRICS, ...COMPOSITION_METRICS];

export function findMetric(key: string): MetricDescriptor {
  const metric = ALL_METRICS.find((m) => m.key === key);
  if (!metric) {
    throw new Error(`Métrica desconhecida: ${key}`);
  }
  return metric;
}
