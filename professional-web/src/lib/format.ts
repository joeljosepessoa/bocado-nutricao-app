export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export function formatNumber(value: number | null | undefined, unit = ''): string {
  if (value == null) return '—';
  return `${value}${unit}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatDelta(value: number | null, unit = ''): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${unit}`;
}

export function formatPercent(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

export function formatCurrencyCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
