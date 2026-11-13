import { describe, expect, it } from 'vitest';
import { isValidHeightCm, normalizeHeightCm } from '../height';
import { translateServerMessage } from '../serverErrors';

describe('altura da avaliação', () => {
  it.each([
    ['166', 166],
    ['1,66', 166],
    ['1.66', 166],
    ['1,7', 170],
    ['166,5', 166.5],
    [' 172 ', 172],
  ])('"%s" vira %s cm', (typed, cm) => {
    expect(normalizeHeightCm(typed)).toBe(cm);
  });

  it('vazio ou texto não vira número', () => {
    expect(normalizeHeightCm('')).toBeNull();
    expect(normalizeHeightCm('abc')).toBeNull();
    expect(normalizeHeightCm('0')).toBeNull();
  });

  it('só aceita o que o servidor aceita', () => {
    expect(isValidHeightCm(166)).toBe(true);
    expect(isValidHeightCm(1660)).toBe(false);
    expect(isValidHeightCm(20)).toBe(false);
    expect(isValidHeightCm(null)).toBe(false);
  });
});

describe('mensagens do servidor em português', () => {
  it.each([
    ['heightCm must not be less than 30', 'Altura não pode ser menor que 30'],
    ['bioimpedance.bodyFatPercent must not be greater than 75', 'Gordura corporal não pode ser maior que 75'],
    ['weightKg must be a number conforming to the specified constraints', 'Peso precisa ser um número'],
  ])('%s', (en, pt) => {
    expect(translateServerMessage(en)).toBe(pt);
  });

  it('mensagem que não conhece passa como veio', () => {
    expect(translateServerMessage('Avaliação não encontrada.')).toBe('Avaliação não encontrada.');
  });
});
