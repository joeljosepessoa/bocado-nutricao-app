import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import type { ClientStatus } from '../types/api';
import { Button } from '../components/Button';
import { CreateClientModal } from '../components/CreateClientModal';
import { DataTable } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../lib/format';
import styles from './ClientsListPage.module.css';

const STATUS_OPTIONS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'archived', label: 'Arquivados' },
];

export function ClientsListPage() {
  const navigate = useNavigate();
  // A busca fica na URL (?q=) para a busca do topo do painel abrir já filtrada.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search, status],
    queryFn: () => api.listClients({ search: search || undefined, status }),
  });

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Pacientes</h1>
          <p className={styles.subtitle}>{data ? `${data.total} paciente(s) encontrados` : 'Carregando…'}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="userPlus" size={17} /> Novo paciente
        </Button>
      </div>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={(e) => setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          />
        </label>
        <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')}>
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
        emptyTitle="Nenhum paciente encontrado"
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
