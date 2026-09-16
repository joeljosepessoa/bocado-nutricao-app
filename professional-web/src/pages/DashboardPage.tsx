import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../lib/format';

const ACTIVITY_LABEL: Record<string, string> = {
  evaluation_created: 'Nova avaliação física',
  diet_published: 'Dieta publicada',
  workout_published: 'Treino publicado',
};

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: api.getDashboard });

  if (isLoading || !data) {
    return <EmptyState title="Carregando…" />;
  }

  const tiles = [
    { label: 'Clientes ativos', value: data.clients.active, hint: `${data.clients.total} no total · ${data.clients.archived} arquivados` },
    { label: 'Avaliações (30 dias)', value: data.evaluations.last30Days },
    { label: 'Avaliações não liberadas', value: data.evaluations.pendingRelease },
    { label: 'Dietas ativas', value: data.diets.active },
    { label: 'Treinos ativos', value: data.workouts.active },
  ];

  return (
    <>
      <h1 style={{ fontSize: 22, margin: 0 }}>Início</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{tile.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{tile.value}</div>
            {tile.hint ? <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{tile.hint}</div> : null}
          </Card>
        ))}
      </div>

      <Card title="Atividade recente">
        {data.recentActivity.length === 0 ? (
          <EmptyState title="Nenhuma atividade ainda" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.recentActivity.map((item, index) => (
              <Link
                key={index}
                to={`/clients/${item.clientId}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: index > 0 ? '1px solid var(--color-border)' : 'none',
                  color: 'var(--color-text)',
                  textDecoration: 'none',
                }}
              >
                <span>
                  <strong>{item.clientName}</strong> — {ACTIVITY_LABEL[item.type] ?? item.type}
                </span>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{formatDateTime(item.occurredAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
