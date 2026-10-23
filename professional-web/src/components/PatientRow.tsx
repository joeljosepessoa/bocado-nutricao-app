import type { ReactNode } from 'react';
import { initials } from '../lib/format';

export interface RowBadge {
  label: string;
  color: string;
  background: string;
}

/**
 * Linha de paciente das telas do menu (Avaliação, IA): clicar no nome abre;
 * selo e botões ficam à direita e quebram para baixo em tela estreita.
 */
export function PatientRow({
  name,
  email,
  badge,
  onOpen,
  openLabel,
  actions,
}: {
  name: string;
  email: string;
  badge?: RowBadge;
  onOpen: () => void;
  openLabel: string;
  actions?: ReactNode;
}) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 16px',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        style={{
          flex: '1 1 220px',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 0,
          border: 0,
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials(name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600 }}>{name}</span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{email}</span>
        </span>
      </button>
      {badge ? (
        <span style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: badge.color, background: badge.background, whiteSpace: 'nowrap' }}>
          {badge.label}
        </span>
      ) : null}
      {actions}
    </li>
  );
}
