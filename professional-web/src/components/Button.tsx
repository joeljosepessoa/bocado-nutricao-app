import React from 'react';
import styles from './Button.module.css';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'normal' | 'small';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'normal', loading, disabled, children, className, ...rest }: Props) {
  return (
    <button
      className={[styles.button, styles[variant], size === 'small' ? styles.small : '', className].join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? '…' : children}
    </button>
  );
}
