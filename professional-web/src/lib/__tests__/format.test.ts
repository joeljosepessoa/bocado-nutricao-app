import { describe, expect, it } from 'vitest';
import { firstName, formatBytes, formatDelta, formatNumber, formatPercent, formatRelativeTime, initials } from '../format';

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

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it('usa minutos, horas e dias em português', () => {
    expect(formatRelativeTime(ago(20_000), now)).toBe('agora');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('há 5 min');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('há 3 h');
    expect(formatRelativeTime(ago(30 * 3_600_000), now)).toBe('ontem');
    expect(formatRelativeTime(ago(12 * 86_400_000), now)).toBe('há 12 dias');
  });
  it('depois de 60 dias mostra a data; vazio/ inválido vira travessão', () => {
    expect(formatRelativeTime(ago(90 * 86_400_000), now)).toBe(new Date(ago(90 * 86_400_000)).toLocaleDateString('pt-BR'));
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime('não é data', now)).toBe('—');
  });
});

describe('initials e firstName', () => {
  it('iniciais do primeiro e último nome', () => {
    expect(initials('Patricia Martins Pessoa')).toBe('PP');
    expect(initials('joel')).toBe('J');
    expect(initials('  ')).toBe('?');
  });
  it('primeiro nome com só a inicial maiúscula', () => {
    expect(firstName('PATRICIA MARTINS PESSOA')).toBe('Patricia');
    expect(firstName('joel pessoa')).toBe('Joel');
    expect(firstName(undefined)).toBe('');
  });
});
