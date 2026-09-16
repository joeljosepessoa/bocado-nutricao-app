import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../api/endpoints';
import { ALL_METRICS, findMetric, toChartPoints } from '../../evolution/metricCatalog';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { formatNumber } from '../../lib/format';

export function EvolutionTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const [metricKey, setMetricKey] = useState('weightKg');

  const { data: points, isLoading } = useQuery({
    queryKey: ['evolution', clientId],
    queryFn: () => api.getEvolutionSeries(clientId!),
    enabled: !!clientId,
  });

  const availableMetrics = useMemo(
    () => (points ? ALL_METRICS.filter((m) => points.some((p) => m.accessor(p) != null)) : []),
    [points],
  );
  const selectedMetric = availableMetrics.some((m) => m.key === metricKey) ? findMetric(metricKey) : availableMetrics[0];
  const chartData = useMemo(
    () => (points && selectedMetric ? toChartPoints(points, selectedMetric) : []),
    [points, selectedMetric],
  );

  if (isLoading) {
    return <EmptyState title="Carregando evolução…" />;
  }
  if (!points || points.length === 0) {
    return <EmptyState title="Nenhuma avaliação registrada ainda" description="O gráfico de evolução aparece a partir da primeira avaliação." />;
  }

  const initial = points[0];
  const current = points[points.length - 1];

  return (
    <>
      <h2 style={{ fontSize: 17, margin: 0 }}>Evolução</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Peso atual</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{formatNumber(current.weightKg, ' kg')}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>% de gordura atual</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{formatNumber(current.bodyFatPercent, '%')}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Massa magra atual</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{formatNumber(current.leanMassKg, ' kg')}</div>
        </Card>
      </div>

      {points.length < 2 ? (
        <EmptyState title="Só há uma avaliação" description="O gráfico e a comparação aparecem a partir da segunda avaliação." />
      ) : (
        <Card>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {availableMetrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--color-border)',
                  background: selectedMetric?.key === m.key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: selectedMetric?.key === m.key ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {chartData.length < 2 ? (
            <EmptyState title="Poucos pontos para este indicador" description="São necessárias ao menos duas avaliações com este dado." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit={selectedMetric?.unit} />
                <Tooltip formatter={(value) => [`${value}${selectedMetric?.unit ?? ''}`, selectedMetric?.label ?? '']} />
                <Line type="monotone" dataKey="value" stroke="#1f7a5c" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            <span>Inicial: {new Date(initial.evaluatedAt).toLocaleDateString('pt-BR')}</span>
            <span>Atual: {new Date(current.evaluatedAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </Card>
      )}
    </>
  );
}
