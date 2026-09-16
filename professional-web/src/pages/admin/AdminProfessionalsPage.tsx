import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api/endpoints';
import type { AdminProfessional } from '../../types/api';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate } from '../../lib/format';

type StatusFilter = 'all' | 'active' | 'suspended';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'suspended', label: 'Suspensos' },
];

export function AdminProfessionalsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'professionals', search, status],
    queryFn: () => api.listAdminProfessionals({ search: search || undefined, status }),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.suspendProfessional(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'professionals'] }),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.reactivateProfessional(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'professionals'] }),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Profissionais</h1>
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
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable<AdminProfessional>
        loading={isLoading}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        emptyTitle="Nenhum profissional encontrado"
        columns={[
          { key: 'name', label: 'Nome', render: (row) => row.user.fullName },
          { key: 'email', label: 'E-mail', render: (row) => row.user.email },
          {
            key: 'status',
            label: 'Status',
            render: (row) => <StatusBadge status={row.user.suspendedAt ? 'suspended' : 'active'} />,
          },
          { key: 'createdAt', label: 'Cadastrado em', render: (row) => formatDate(row.user.createdAt) },
          {
            key: 'actions',
            label: '',
            render: (row) =>
              row.user.suspendedAt ? (
                <Button
                  size="small"
                  variant="secondary"
                  loading={reactivateMutation.isPending && reactivateMutation.variables === row.id}
                  onClick={() => reactivateMutation.mutate(row.id)}
                >
                  Reativar
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="danger"
                  loading={suspendMutation.isPending && suspendMutation.variables === row.id}
                  onClick={() => suspendMutation.mutate(row.id)}
                >
                  Suspender
                </Button>
              ),
          },
        ]}
      />
    </>
  );
}
