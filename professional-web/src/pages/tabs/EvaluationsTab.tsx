import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Card } from '../../components/Card';
import { formatDate, formatDelta, formatNumber, formatPercent } from '../../lib/format';

const COMPARISON_FIELDS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'weightKg', label: 'Peso', unit: ' kg' },
  { key: 'bmi', label: 'IMC', unit: '' },
  { key: 'bodyFatPercent', label: '% de gordura', unit: '%' },
  { key: 'fatMassKg', label: 'Massa gorda', unit: ' kg' },
  { key: 'leanMassKg', label: 'Massa magra', unit: ' kg' },
  { key: 'waistCm', label: 'Cintura', unit: ' cm' },
  { key: 'hipCm', label: 'Quadril', unit: ' cm' },
  { key: 'chestCm', label: 'Tórax', unit: ' cm' },
  { key: 'skinfoldSumMm', label: 'Soma de dobras', unit: ' mm' },
  { key: 'muscleMassKg', label: 'Massa muscular', unit: ' kg' },
  { key: 'bodyWaterPercent', label: 'Água corporal', unit: '%' },
  { key: 'visceralFatLevel', label: 'Gordura visceral', unit: '' },
];

export function EvaluationsTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', clientId],
    queryFn: () => api.listEvaluations(clientId!),
  });

  const comparison = useQuery({
    queryKey: ['evaluation-compare', clientId, compareFrom, compareTo],
    queryFn: () => api.compareEvaluations(clientId!, compareFrom!, compareTo!),
    enabled: !!compareFrom && !!compareTo && compareFrom !== compareTo,
  });

  const items = data?.items ?? [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Histórico de avaliações</h2>
        <Button onClick={() => navigate(`/clients/${clientId}/evaluations/new`)}>+ Nova avaliação</Button>
      </div>

      <DataTable
        loading={isLoading}
        rows={items}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/clients/${clientId}/evaluations/${row.id}`)}
        emptyTitle="Nenhuma avaliação registrada ainda"
        columns={[
          { key: 'date', label: 'Data', render: (row) => formatDate(row.evaluatedAt) },
          { key: 'weight', label: 'Peso', render: (row) => formatNumber(row.weightKg, ' kg') },
          { key: 'bmi', label: 'IMC', render: (row) => formatNumber(row.calculatedMetrics?.bmi ?? null) },
          { key: 'fat', label: '% gordura', render: (row) => formatNumber(row.calculatedMetrics?.bodyFatPercent ?? null, '%') },
        ]}
      />

      {items.length >= 2 ? (
        <Card title="Comparar avaliações">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PickEvaluation label="De" items={items} value={compareFrom} onChange={setCompareFrom} />
            <PickEvaluation label="Para" items={items} value={compareTo} onChange={setCompareTo} />
          </div>

          {comparison.data ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    <th style={{ padding: '6px 8px' }}>Indicador</th>
                    <th style={{ padding: '6px 8px' }}>Diferença</th>
                    <th style={{ padding: '6px 8px' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FIELDS.filter((f) => comparison.data.deltas[f.key] != null).map((f) => (
                    <tr key={f.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{f.label}</td>
                      <td style={{ padding: '6px 8px' }}>{formatDelta(comparison.data.deltas[f.key], f.unit)}</td>
                      <td style={{ padding: '6px 8px' }}>{formatPercent(comparison.data.deltasPercent[f.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {comparison.data.bodyFatSourceChanged ? (
                <div style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 8 }}>
                  ⚠ A fonte do %gordura mudou entre as duas avaliações (dobras ↔ bioimpedância) — compare com cautela.
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function PickEvaluation({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ id: string; evaluatedAt: string }>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}
      >
        <option value="" disabled>
          Selecione…
        </option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {formatDate(item.evaluatedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}
