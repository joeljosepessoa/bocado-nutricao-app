import styles from './StatusBadge.module.css';

type Tone = 'neutral' | 'positive' | 'warning' | 'negative';

const STATUS_TONE: Record<string, Tone> = {
  active: 'positive',
  published: 'positive',
  ready: 'positive',
  archived: 'neutral',
  superseded: 'neutral',
  inactive: 'neutral',
  draft: 'warning',
  queued: 'warning',
  generating: 'warning',
  failed: 'negative',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  archived: 'Arquivado',
  draft: 'Rascunho',
  published: 'Publicado',
  superseded: 'Substituído',
  queued: 'Na fila',
  generating: 'Gerando',
  ready: 'Pronto',
  failed: 'Falhou',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABEL[status] ?? status;
  return <span className={[styles.badge, styles[tone]].join(' ')}>{label}</span>;
}
