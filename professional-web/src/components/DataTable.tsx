import React from 'react';
import styles from './DataTable.module.css';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyTitle, emptyDescription, loading }: Props<T>) {
  if (loading) {
    return <EmptyState title="Carregando…" />;
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle ?? 'Nada por aqui ainda'} description={emptyDescription} />;
  }

  return (
    <div className={styles.wrapper}>
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? styles.clickable : ''} onClick={() => onRowClick?.(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
