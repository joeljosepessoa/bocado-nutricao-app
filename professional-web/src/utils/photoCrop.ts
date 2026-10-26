/**
 * Cálculo do recorte de foto (sem tela): o quadro de recorte é guardado em FRAÇÕES da imagem (0 a 1),
 * então não depende do tamanho em que a foto aparece na tela.
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const FULL_RECT: CropRect = { x: 0, y: 0, w: 1, h: 1 };
/** Menor quadro aceito (5% de cada lado) — evita recortar "nada". */
export const MIN_SIZE = 0.05;
/** Lado maior da foto recortada: suficiente para o relatório e bem abaixo do limite de 10 MB. */
export const MAX_OUTPUT_SIDE = 2200;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Arrastar o quadro inteiro, sem sair da foto. */
export function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
  return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
}

/** Puxar um canto: o canto oposto fica parado; nunca menor que MIN_SIZE nem fora da foto. */
export function resizeRect(rect: CropRect, corner: Corner, dx: number, dy: number): CropRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  if (corner === 'nw' || corner === 'sw') left = clamp(left + dx, 0, right - MIN_SIZE);
  if (corner === 'ne' || corner === 'se') right = clamp(right + dx, left + MIN_SIZE, 1);
  if (corner === 'nw' || corner === 'ne') top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (corner === 'sw' || corner === 'se') bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Pedaço da imagem original (em pixels) e o tamanho final, reduzido se passar de MAX_OUTPUT_SIDE. */
export function cropPixels(rect: CropRect, naturalWidth: number, naturalHeight: number, maxSide = MAX_OUTPUT_SIDE) {
  const sx = Math.round(rect.x * naturalWidth);
  const sy = Math.round(rect.y * naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * naturalHeight));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return { sx, sy, sw, sh, outW: Math.max(1, Math.round(sw * scale)), outH: Math.max(1, Math.round(sh * scale)) };
}

/** Nome do arquivo recortado: mesmo nome, terminado em "-recorte.jpg". */
export function croppedFileName(original: string): string {
  const base = original.replace(/\.[a-z0-9]+$/i, '') || 'foto';
  return `${base}-recorte.jpg`;
}
