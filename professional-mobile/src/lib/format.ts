export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return `${value}${suffix}`;
}
