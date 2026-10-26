import { describe, expect, it } from 'vitest';
import { croppedFileName, cropPixels, FULL_RECT, MIN_SIZE, moveRect, resizeRect } from '../photoCrop';

describe('recorte de foto', () => {
  it('arrastar o quadro não deixa sair da foto', () => {
    const rect = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveRect(rect, 0.1, 0.1)).toEqual({ x: 0.30000000000000004, y: 0.30000000000000004, w: 0.5, h: 0.5 });
    expect(moveRect(rect, 1, -1)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('puxar um canto mantém o oposto parado e respeita o tamanho mínimo', () => {
    const cut = resizeRect(FULL_RECT, 'nw', 0.1, 0.2);
    expect(cut.x).toBeCloseTo(0.1);
    expect(cut.y).toBeCloseTo(0.2);
    expect(cut.x + cut.w).toBeCloseTo(1);
    expect(cut.y + cut.h).toBeCloseTo(1);
    const tiny = resizeRect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 'se', -1, -1);
    expect(tiny.w).toBeCloseTo(MIN_SIZE);
    expect(tiny.h).toBeCloseTo(MIN_SIZE);
    expect(resizeRect(FULL_RECT, 'se', 0.5, 0.5)).toEqual(FULL_RECT);
  });

  it('converte para pixels e reduz fotos muito grandes', () => {
    expect(cropPixels({ x: 0.1, y: 0.25, w: 0.5, h: 0.5 }, 1000, 2000)).toEqual({ sx: 100, sy: 500, sw: 500, sh: 1000, outW: 500, outH: 1000 });
    const big = cropPixels(FULL_RECT, 3000, 4000);
    expect(big.outH).toBe(2200);
    expect(big.outW).toBe(1650);
  });

  it('nome do arquivo recortado', () => {
    expect(croppedFileName('frente.png')).toBe('frente-recorte.jpg');
    expect(croppedFileName('foto')).toBe('foto-recorte.jpg');
  });
});
