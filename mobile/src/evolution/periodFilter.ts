import type { EvolutionEntry } from '../types/api';

export type Period = '3m' | '6m' | '12m' | 'all';

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
  { value: 'all', label: 'Tudo' },
];

/**
 * Filtro local sobre a lista já carregada — a evolução do cliente nunca
 * precisa de uma nova chamada de rede para trocar de período (ver desenho
 * da Fase 8, Seção 3).
 */
export function filterByPeriod(entries: EvolutionEntry[], period: Period, now: Date = new Date()): EvolutionEntry[] {
  if (period === 'all') {
    return entries;
  }
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffMs = cutoff.getTime();

  return entries.filter((entry) => new Date(entry.evaluatedAt).getTime() >= cutoffMs);
}
