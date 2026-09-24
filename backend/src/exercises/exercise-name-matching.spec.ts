import { buildCatalogIndex, CatalogExerciseRef, matchExerciseName, MAX_MATCH_CANDIDATES, normalizeExerciseName } from './exercise-name-matching';

const ex = (id: string, name: string, imageUrl: string | null = null): CatalogExerciseRef => ({
  id,
  name,
  muscleGroup: null,
  equipment: null,
  imageUrl,
});

describe('normalizeExerciseName', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(normalizeExerciseName('  Tríceps-Pulley (corda) ')).toBe('triceps pulley corda');
  });
});

describe('matchExerciseName', () => {
  const index = buildCatalogIndex([
    ex('1', 'Supino reto com barra', '/exercise-media/abc'),
    ex('2', 'Supino reto com halteres'),
    ex('3', 'Tríceps pulley'),
    ex('4', 'Crucifixo inclinado'),
    ex('5', 'Rosca direta'),
    ex('6', 'Rosca direta'),
  ]);

  it('nome idêntico e único → matched (com o registro real do catálogo, incl. imageUrl)', () => {
    const match = matchExerciseName('supino reto com barra', index);
    expect(match.status).toBe('matched');
    expect(match.exercise).toEqual(ex('1', 'Supino reto com barra', '/exercise-media/abc'));
  });

  it('diferença só de acento/caixa ainda é o mesmo nome', () => {
    expect(matchExerciseName('TRICEPS PULLEY', index).exercise?.id).toBe('3');
  });

  it('nome idêntico duplicado no catálogo → ambiguous, sem escolher sozinho', () => {
    const match = matchExerciseName('Rosca direta', index);
    expect(match.status).toBe('ambiguous');
    expect(match.exercise).toBeNull();
    expect(match.candidates.map((c) => c.id).sort()).toEqual(['5', '6']);
  });

  it('nome parcial com duas possibilidades → ambiguous com sugestões', () => {
    const match = matchExerciseName('Supino reto', index);
    expect(match.status).toBe('ambiguous');
    expect(match.candidates.map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('nome parcial com uma só possibilidade NÃO é associado — not_found com sugestão', () => {
    const match = matchExerciseName('Crucifixo', index);
    expect(match.status).toBe('not_found');
    expect(match.exercise).toBeNull();
    expect(match.candidates.map((c) => c.id)).toEqual(['4']);
  });

  it('nome sem relação com o catálogo → not_found sem sugestões', () => {
    expect(matchExerciseName('Levantamento terra romeno', index)).toEqual({ status: 'not_found', exercise: null, candidates: [] });
  });

  it('nome vazio ou só pontuação → not_found', () => {
    expect(matchExerciseName('  --  ', index).status).toBe('not_found');
  });

  it('limita o número de sugestões', () => {
    const many = buildCatalogIndex(Array.from({ length: 12 }, (_, i) => ex(String(i), `Remada variação ${i}`)));
    expect(matchExerciseName('Remada', many).candidates).toHaveLength(MAX_MATCH_CANDIDATES);
  });
});
