/** Converte "15m", "7d" etc. em milissegundos. Formato desconhecido cai em 7 dias. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (unitMs[match[2]] ?? 86_400_000);
}
