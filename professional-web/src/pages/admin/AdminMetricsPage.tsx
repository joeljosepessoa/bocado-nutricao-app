import { useQuery } from '@tanstack/react-query';
import * as api from '../../api/endpoints';
import { EmptyState } from '../../components/EmptyState';

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

export function AdminMetricsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'metrics'], queryFn: api.getPlatformMetrics });

  return (
    <>
      <h1 style={{ fontSize: 22, margin: 0 }}>Métricas da plataforma</h1>

      {isLoading ? (
        <EmptyState title="Carregando…" />
      ) : !data ? (
        <EmptyState title="Não foi possível carregar as métricas" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <Tile label="Profissionais" value={data.professionals.total} />
          <Tile label="Profissionais suspensos" value={data.professionals.suspended} />
          <Tile label="Clientes" value={data.clients.total} />
          <Tile label="Avaliações físicas" value={data.evaluations.total} />
          <Tile label="Dietas" value={data.diets.total} />
          <Tile label="Treinos" value={data.workouts.total} />
          <Tile label="Alimentos globais aprovados" value={data.foods.globalApproved} />
          <Tile label="Alimentos globais pendentes" value={data.foods.globalPending} />
          <Tile label="Exercícios globais aprovados" value={data.exercises.globalApproved} />
          <Tile label="Exercícios globais pendentes" value={data.exercises.globalPending} />
        </div>
      )}
    </>
  );
}
