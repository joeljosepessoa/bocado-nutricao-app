import React from 'react';
import styles from './Modal.module.css';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Modal({ title, onClose, children, actions }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  );
}
