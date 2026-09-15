import type { EvolutionEntry } from '../types/api';
import type { MetricDescriptor } from './metricCatalog';

export interface ChartPoint {
  timestamp: number;
  value: number;
  evaluationId: string;
}

/**
 * Converte a lista (já ordenada ou não) em pontos prontos para desenhar,
 * ordenados por tempo real — nunca por índice, para não fingir
 * regularidade que os dados não têm. Avaliações sem esta métrica são
 * simplesmente omitidas, nunca interpoladas ou zeradas.
 */
export function toChartPoints(entries: EvolutionEntry[], metric: MetricDescriptor): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const entry of entries) {
    const value = metric.accessor(entry);
    if (value == null) {
      continue;
    }
    points.push({ timestamp: new Date(entry.evaluatedAt).getTime(), value, evaluationId: entry.id });
  }
  return points.sort((a, b) => a.timestamp - b.timestamp);
}
