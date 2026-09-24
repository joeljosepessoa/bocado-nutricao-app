import { resolveEvolutionViewState } from '../emptyState';
import type { EvolutionEntry } from '../../types/api';

function makeEntry(id: string): EvolutionEntry {
  return {
    id,
    evaluatedAt: '2026-01-01T00:00:00Z',
    weightKg: 80,
    bmi: 25,
    bmiClassification: 'sobrepeso',
    bodyFatPercent: 15,
    fatMassKg: 12,
    leanMassKg: 68,
    measurements: null,
    composition: null,
    photos: [],
  };
}

describe('resolveEvolutionViewState', () => {
  it('nenhuma avaliação liberada -> "none"', () => {
    expect(resolveEvolutionViewState([])).toBe('none');
  });

  it('exatamente uma avaliação liberada -> "single" (sem gráfico/comparação)', () => {
    expect(resolveEvolutionViewState([makeEntry('a')])).toBe('single');
  });

  it('duas ou mais avaliações liberadas -> "full"', () => {
    expect(resolveEvolutionViewState([makeEntry('a'), makeEntry('b')])).toBe('full');
    expect(resolveEvolutionViewState([makeEntry('a'), makeEntry('b'), makeEntry('c')])).toBe('full');
  });
});
