import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';
import { EmptyState } from '../components/EmptyState';

const TAB_ITEMS = [
  { key: '', label: 'Visão geral' },
  { key: 'evaluations', label: 'Avaliação física' },
  { key: 'evolution', label: 'Evolução' },
  { key: 'diet', label: 'Dieta' },
  { key: 'workout', label: 'Treino' },
  { key: 'reports', label: 'Relatórios' },
];

export function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.getClient(clientId!),
    enabled: !!clientId,
  });

  if (isLoading || !client) {
    return <EmptyState title="Carregando cliente…" />;
  }

  const activeSegment = location.pathname.split(`/clients/${clientId}/`)[1]?.split('/')[0] ?? '';

  return (
    <>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{client.user.fullName}</h1>
          <StatusBadge status={client.status} />
        </div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{client.user.email}</div>
      </div>

      <Tabs
        items={TAB_ITEMS}
        activeKey={activeSegment}
        onChange={(key) => navigate(`/clients/${clientId}${key ? `/${key}` : ''}`)}
      />

      <Outlet context={{ client }} />
    </>
  );
}
