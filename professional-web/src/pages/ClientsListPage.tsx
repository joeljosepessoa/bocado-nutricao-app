import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import type { ClientStatus } from '../types/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { formatDate } from '../lib/format';

const STATUS_OPTIONS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'archived', label: 'Arquivados' },
];

function CreateClientModal({ onClose }: { onClose: () => void }) {
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
    },
    onError: () => setError('Não foi possível cadastrar. Confira os dados informados.'),
  });

  if (result) {
    return (
      <Modal title="Cliente cadastrado" onClose={onClose} actions={<Button onClick={onClose}>Fechar</Button>}>
        <p>Senha temporária gerada — envie ao cliente por um canal seguro (ela não pode ser vista novamente):</p>
        <div style={{ fontFamily: 'monospace', fontSize: 16, background: 'var(--color-bg)', padding: 12, borderRadius: 8 }}>
          {result.temporaryPassword}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Novo cliente"
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

export function ClientsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search, status],
    queryFn: () => api.listClients({ search: search || undefined, status }),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Clientes</h1>
        <Button onClick={() => setShowCreate(true)}>+ Novo cliente</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')}
          style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/clients/${row.id}`)}
        emptyTitle="Nenhum cliente encontrado"
        columns={[
          { key: 'name', label: 'Nome', render: (row) => row.user.fullName },
          { key: 'email', label: 'E-mail', render: (row) => row.user.email },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          { key: 'createdAt', label: 'Cadastrado em', render: (row) => formatDate(row.createdAt) },
        ]}
      />

      {showCreate ? <CreateClientModal onClose={() => setShowCreate(false)} /> : null}
    </>
  );
}
