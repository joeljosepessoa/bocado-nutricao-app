import { describe, expect, it } from 'vitest';
import { describeExercise, isApiMediaPath, isExternalImageUrl } from '../exerciseMedia';

describe('isApiMediaPath', () => {
  it('aceita só o caminho relativo servido pela própria API', () => {
    expect(isApiMediaPath(`/exercise-media/${'a'.repeat(64)}`)).toBe(true);
  });

  it('nunca aceita URL que mandaria o token para outro host', () => {
    expect(isApiMediaPath('//evil.example/exercise-media/x')).toBe(false);
    expect(isApiMediaPath('https://evil.example/exercise-media/x')).toBe(false);
    expect(isApiMediaPath('/outra-rota/x')).toBe(false);
    expect(isApiMediaPath('/exercise-media/')).toBe(false);
    expect(isApiMediaPath(null)).toBe(false);
    expect(isApiMediaPath(undefined)).toBe(false);
  });
});

describe('isExternalImageUrl', () => {
  it('reconhece só http(s) absoluto', () => {
    expect(isExternalImageUrl('https://cdn.example/x.gif')).toBe(true);
    expect(isExternalImageUrl('/exercise-media/abc')).toBe(false);
    expect(isExternalImageUrl(null)).toBe(false);
  });
});

describe('describeExercise', () => {
  it('junta músculo e equipamento quando existem', () => {
    expect(describeExercise({ muscleGroup: 'Bíceps', equipment: 'Barra' })).toBe('Bíceps · Barra');
  });
  it('omite o que faltar', () => {
    expect(describeExercise({ muscleGroup: null, equipment: 'Barra' })).toBe('Barra');
    expect(describeExercise({ muscleGroup: null, equipment: null })).toBe('');
  });
});
