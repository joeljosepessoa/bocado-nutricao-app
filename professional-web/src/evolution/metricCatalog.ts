import type { EvolutionPoint } from '../types/api';

export interface MetricDescriptor {
  key: string;
  label: string;
  unit: string;
  accessor: (point: EvolutionPoint) => number | null;
}

export const PRIMARY_METRICS: MetricDescriptor[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', accessor: (p) => p.weightKg },
  { key: 'bmi', label: 'IMC', unit: '', accessor: (p) => p.bmi },
  { key: 'bodyFatPercent', label: '% de gordura', unit: '%', accessor: (p) => p.bodyFatPercent },
  { key: 'fatMassKg', label: 'Massa gorda', unit: 'kg', accessor: (p) => p.fatMassKg },
  { key: 'leanMassKg', label: 'Massa magra', unit: 'kg', accessor: (p) => p.leanMassKg },
  { key: 'skinfoldSumMm', label: 'Soma de dobras', unit: 'mm', accessor: (p) => p.skinfoldSumMm },
];

export const MEASUREMENT_METRICS: MetricDescriptor[] = [
  { key: 'waistCm', label: 'Cintura', unit: 'cm', accessor: (p) => p.measurements?.waistCm ?? null },
  { key: 'abdomenCm', label: 'Abdômen', unit: 'cm', accessor: (p) => p.measurements?.abdomenCm ?? null },
  { key: 'hipCm', label: 'Quadril', unit: 'cm', accessor: (p) => p.measurements?.hipCm ?? null },
  { key: 'chestCm', label: 'Tórax', unit: 'cm', accessor: (p) => p.measurements?.chestCm ?? null },
  { key: 'armRightCm', label: 'Braço direito', unit: 'cm', accessor: (p) => p.measurements?.armRightCm ?? null },
  { key: 'thighRightCm', label: 'Coxa direita', unit: 'cm', accessor: (p) => p.measurements?.thighRightCm ?? null },
];

export const COMPOSITION_METRICS: MetricDescriptor[] = [
  { key: 'muscleMassKg', label: 'Massa muscular', unit: 'kg', accessor: (p) => p.bioimpedance?.muscleMassKg ?? null },
  { key: 'bodyWaterPercent', label: 'Água corporal', unit: '%', accessor: (p) => p.bioimpedance?.bodyWaterPercent ?? null },
  { key: 'visceralFatLevel', label: 'Gordura visceral', unit: '', accessor: (p) => p.bioimpedance?.visceralFatLevel ?? null },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal', unit: 'kcal', accessor: (p) => p.bioimpedance?.basalMetabolicRateKcal ?? null },
];

export const ALL_METRICS = [...PRIMARY_METRICS, ...MEASUREMENT_METRICS, ...COMPOSITION_METRICS];

export function findMetric(key: string): MetricDescriptor {
  const metric = ALL_METRICS.find((m) => m.key === key);
  if (!metric) throw new Error(`Métrica desconhecida: ${key}`);
  return metric;
}

export interface ChartPoint {
  timestamp: number;
  value: number;
  evaluationId: string;
  dateLabel: string;
}

/** Mesma filosofia da Fase 8 (mobile): omite pontos sem a métrica, nunca interpola. */
export function toChartPoints(points: EvolutionPoint[], metric: MetricDescriptor): ChartPoint[] {
  const result: ChartPoint[] = [];
  for (const point of points) {
    const value = metric.accessor(point);
    if (value == null) continue;
    const date = new Date(point.evaluatedAt);
    result.push({
      timestamp: date.getTime(),
      value,
      evaluationId: point.id,
      dateLabel: date.toLocaleDateString('pt-BR'),
    });
  }
  return result.sort((a, b) => a.timestamp - b.timestamp);
}
