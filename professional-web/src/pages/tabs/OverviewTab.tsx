import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import type { ClientDetail } from '../../types/api';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { formatDate } from '../../lib/format';

export function OverviewTab() {
  const { client } = useOutletContext<{ client: ClientDetail }>();
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(client.user.fullName);
  const [phone, setPhone] = useState(client.phone ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const updateMutation = useMutation({
    mutationFn: () => api.updateClient(clientId!, { fullName, phone, notes }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.updateClient(clientId!, { status: client.status === 'archived' ? 'active' : 'archived' }),
    onSuccess: invalidate,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.resetClientPassword(clientId!),
    onSuccess: (data) => setResetResult(data.temporaryPassword),
  });

  return (
    <>
      <Card title="Dados básicos">
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
            <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <TextField label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Notas</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, fontFamily: 'inherit' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="E-mail" value={client.user.email} />
            <Field label="Telefone" value={client.phone ?? '—'} />
            <Field label="Gênero" value={client.gender ?? '—'} />
            <Field label="Nascimento" value={formatDate(client.birthDate)} />
            <Field label="Cliente desde" value={formatDate(client.createdAt)} />
          </div>
        )}
        {client.notes && !editing ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Notas: {client.notes}</div>
        ) : null}
        {!editing ? <Button onClick={() => setEditing(true)}>Editar dados</Button> : null}
      </Card>

      <Card title="Acesso">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => resetPasswordMutation.mutate()} loading={resetPasswordMutation.isPending}>
            Redefinir senha
          </Button>
          <Button variant={client.status === 'archived' ? 'secondary' : 'danger'} onClick={() => setConfirmArchive(true)}>
            {client.status === 'archived' ? 'Reativar cliente' : 'Arquivar cliente'}
          </Button>
        </div>
      </Card>

      {confirmArchive ? (
        <ConfirmDialog
          title={client.status === 'archived' ? 'Reativar cliente' : 'Arquivar cliente'}
          description={
            client.status === 'archived'
              ? `${client.user.fullName} voltará a aparecer como cliente ativo.`
              : `${client.user.fullName} será marcado como arquivado. Os dados não são apagados e podem ser reativados depois.`
          }
          danger={client.status !== 'archived'}
          onConfirm={() => archiveMutation.mutateAsync()}
          onClose={() => setConfirmArchive(false)}
        />
      ) : null}

      {resetResult ? (
        <Modal title="Senha redefinida" onClose={() => setResetResult(null)} actions={<Button onClick={() => setResetResult(null)}>Fechar</Button>}>
          <p>Nova senha temporária — envie ao cliente por um canal seguro:</p>
          <div style={{ fontFamily: 'monospace', fontSize: 16, background: 'var(--color-bg)', padding: 12, borderRadius: 8 }}>
            {resetResult}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}
