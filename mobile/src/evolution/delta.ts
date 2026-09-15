/**
 * Mesma matemática do backend (PhysicalEvaluationsService.compare) —
 * comparação entre dois pontos é calculada aqui, no app, porque o cliente
 * só recebe campos já autorizados; não há necessidade de um endpoint de
 * comparação dedicado do lado cliente (ver desenho da Fase 8, Seção 4).
 */
export function computeDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) {
    return null;
  }
  return Math.round((b - a) * 100) / 100;
}

/** Base 0 não tem variação percentual definida — null, nunca Infinity. */
export function computePercentDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) {
    return null;
  }
  return Math.round(((b - a) / a) * 1000) / 10;
}
