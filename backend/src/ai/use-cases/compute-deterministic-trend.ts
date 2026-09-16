export interface TrendInputPoint {
  evaluatedAt: Date;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPercent: number | null;
}

export interface TrendMetric {
  label: string;
  unit: string;
  previousValue: number;
  currentValue: number;
  delta: number;
}

const TREND_FIELDS: Array<{ key: 'weightKg' | 'bmi' | 'bodyFatPercent'; label: string; unit: string }> = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'bmi', label: 'IMC', unit: '' },
  { key: 'bodyFatPercent', label: '% de gordura', unit: '%' },
];

/**
 * Cálculo determinístico da tendência — a IA nunca vê os pontos brutos,
 * só o resultado desta função (Fase 12, decisão 1-C: "a IA NÃO calcula o
 * indicador original"). Uma métrica só entra no resultado quando os dois
 * pontos têm valor para ela — nunca inventa uma tendência a partir de dado
 * ausente em um dos lados.
 */
export function computeDeterministicTrend(previous: TrendInputPoint, current: TrendInputPoint): TrendMetric[] {
  const metrics: TrendMetric[] = [];
  for (const field of TREND_FIELDS) {
    const previousValue = previous[field.key];
    const currentValue = current[field.key];
    if (previousValue == null || currentValue == null) {
      continue;
    }
    metrics.push({
      label: field.label,
      unit: field.unit,
      previousValue,
      currentValue,
      delta: round(currentValue - previousValue, 2),
    });
  }
  return metrics;
}

export function daysBetween(from: Date, to: Date): number {
  const ms = Math.abs(to.getTime() - from.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
