import { formatDate, formatNumber } from '../format';

describe('formatDate', () => {
  it('formata uma data ISO no padrão pt-BR', () => {
    expect(formatDate('2026-03-05T00:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it('devolve travessão para data inválida', () => {
    expect(formatDate('não-é-uma-data')).toBe('—');
  });
});

describe('formatNumber', () => {
  it('formata número com sufixo', () => {
    expect(formatNumber(82.4, ' kg')).toBe('82.4 kg');
  });

  it('devolve travessão para null/undefined', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });
});
