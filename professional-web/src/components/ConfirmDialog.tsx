import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
}

/**
 * Toda ação destrutiva do painel (arquivar cliente, excluir relatório,
 * retirar liberação) passa por aqui — nunca some direto de um clique só.
 */
export function ConfirmDialog({ title, description, confirmLabel = 'Confirmar', danger, onConfirm, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{description}</p>
    </Modal>
  );
}
