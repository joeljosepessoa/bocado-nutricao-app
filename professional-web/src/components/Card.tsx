import React from 'react';
import styles from './Card.module.css';

export function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')}>
      {title ? <div className={styles.title}>{title}</div> : null}
      {children}
    </div>
  );
}
