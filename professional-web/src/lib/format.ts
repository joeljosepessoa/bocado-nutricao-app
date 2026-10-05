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

/** "agora", "há 5 min", "há 3 h", "ontem", "há 12 dias"; depois de 60 dias, a data. */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '—';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 60) return `há ${days} dias`;
  return formatDate(iso);
}

/** Iniciais para avatar: primeira letra do primeiro e do último nome. */
export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

/** Primeiro nome, com só a inicial maiúscula ("PATRICIA" → "Patricia"). */
export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : '';
}
