import React from 'react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{label}</span>
      <input
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontSize: 14,
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          ...style,
        }}
        {...rest}
      />
      {error ? <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</span> : null}
    </label>
  );
}
