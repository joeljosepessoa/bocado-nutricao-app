import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from './Button';
import { Modal } from './Modal';
import { TextField } from './TextField';

/** Cadastro rápido de paciente — usado na lista de pacientes e no início do painel. */
export function CreateClientModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<{ temporaryPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.createClient({ fullName, email, phone: phone || undefined }),
    onSuccess: (data) => {
      setResult({ temporaryPassword: data.temporaryPassword });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setError('Não foi possível cadastrar. Confira os dados informados.'),
  });

  if (result) {
    return (
      <Modal title="Paciente cadastrado" onClose={onClose} actions={<Button onClick={onClose}>Fechar</Button>}>
        <p>Senha temporária gerada — envie ao paciente por um canal seguro (ela não pode ser vista novamente):</p>
        <div style={{ fontFamily: 'monospace', fontSize: 16, background: 'var(--color-bg)', padding: 12, borderRadius: 8 }}>
          {result.temporaryPassword}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Novo paciente"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!fullName || !email}>
            Cadastrar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}
      </div>
    </Modal>
  );
}
