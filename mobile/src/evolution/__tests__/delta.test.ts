import { computeDelta, computePercentDelta } from '../delta';

describe('computeDelta', () => {
  it('calcula a diferença absoluta arredondada em 2 casas', () => {
    expect(computeDelta(85, 80)).toBe(-5);
    expect(computeDelta(80, 85)).toBe(5);
    expect(computeDelta(80.333, 80.667)).toBeCloseTo(0.33, 2);
  });

  it('devolve null quando qualquer um dos dois falta', () => {
    expect(computeDelta(null, 80)).toBeNull();
    expect(computeDelta(80, null)).toBeNull();
    expect(computeDelta(null, null)).toBeNull();
  });

  it('zero é um valor válido, não "faltando"', () => {
    expect(computeDelta(0, 5)).toBe(5);
    expect(computeDelta(5, 0)).toBe(-5);
  });
});

describe('computePercentDelta', () => {
  it('calcula a variação percentual sobre o valor de origem', () => {
    expect(computePercentDelta(80, 76)).toBeCloseTo(-5, 1);
    expect(computePercentDelta(100, 110)).toBeCloseTo(10, 1);
  });

  it('devolve null quando a base é 0 — nunca Infinity', () => {
    expect(computePercentDelta(0, 5)).toBeNull();
  });

  it('devolve null quando qualquer um dos dois falta', () => {
    expect(computePercentDelta(null, 5)).toBeNull();
    expect(computePercentDelta(5, null)).toBeNull();
  });
});
