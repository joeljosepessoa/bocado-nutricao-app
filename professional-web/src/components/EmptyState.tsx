import React from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-secondary)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>{title}</div>
      {description ? <div style={{ fontSize: 13, marginBottom: 12 }}>{description}</div> : null}
      {action}
    </div>
  );
}
