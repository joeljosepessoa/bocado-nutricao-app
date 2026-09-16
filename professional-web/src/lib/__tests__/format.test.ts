import { describe, expect, it } from 'vitest';
import { formatBytes, formatDelta, formatNumber, formatPercent } from '../format';

describe('formatNumber', () => {
  it('formata valor com unidade', () => {
    expect(formatNumber(80, ' kg')).toBe('80 kg');
  });
  it('null vira travessão', () => {
    expect(formatNumber(null)).toBe('—');
  });
});

describe('formatDelta', () => {
  it('adiciona sinal de mais para valores positivos', () => {
    expect(formatDelta(2, ' kg')).toBe('+2 kg');
  });
  it('mantém o sinal de menos para negativos', () => {
    expect(formatDelta(-2, ' kg')).toBe('-2 kg');
  });
  it('null vira travessão', () => {
    expect(formatDelta(null)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formata percentual positivo com sinal', () => {
    expect(formatPercent(5)).toBe('+5%');
  });
  it('null vira travessão', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('bytes pequenos', () => {
    expect(formatBytes(500)).toBe('500 B');
  });
  it('KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('MB', () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
  it('null vira travessão', () => {
    expect(formatBytes(null)).toBe('—');
  });
});
