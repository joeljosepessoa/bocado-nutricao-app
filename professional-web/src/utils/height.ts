/** Altura aceita pelo servidor, em centímetros. */
export const MIN_HEIGHT_CM = 30;
export const MAX_HEIGHT_CM = 260;

export const INVALID_HEIGHT_MESSAGE = 'Altura inválida: informe em centímetros, por exemplo 166.';

/**
 * Lê a altura digitada no campo "Altura (cm)". Quem digita em metros ("1,66" ou
 * "1.66") recebe a conversão para centímetros (166) — antes o servidor recusava
 * a avaliação inteira. Devolve null quando não dá para ler um número.
 */
export function normalizeHeightCm(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = n < 3 ? n * 100 : n;
  return Math.round(cm * 10) / 10;
}

export function isValidHeightCm(cm: number | null): cm is number {
  return cm != null && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
}
