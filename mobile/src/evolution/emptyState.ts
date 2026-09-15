import type { EvolutionEntry } from '../types/api';

export type EvolutionViewState = 'none' | 'single' | 'full';

/**
 * Zero liberadas: mensagem já existente. Uma liberada: mostra o snapshot
 * atual, mas sem gráfico/comparação (uma linha de um ponto não comunica
 * tendência nenhuma). Duas ou mais: experiência completa.
 */
export function resolveEvolutionViewState(entries: EvolutionEntry[]): EvolutionViewState {
  if (entries.length === 0) {
    return 'none';
  }
  if (entries.length === 1) {
    return 'single';
  }
  return 'full';
}
