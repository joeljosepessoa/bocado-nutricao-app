import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { formatDate } from '../lib/format';

/** Visão geral do paciente: formulários próprios já preenchidos + "Preencher formulário". */
export function ClientFormsCard({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(false);
  const responses = useQuery({ queryKey: ['form-responses', clientId], queryFn: () => api.listFormResponses(clientId) });
  const forms = useQuery({ queryKey: ['custom-forms', false], queryFn: () => api.listForms(false), enabled: choosing });
  const rows = responses.data ?? [];

  return (
    <Card title="Formulários">
      {responses.isLoading ? (
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando…</span>
      ) : rows.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum formulário preenchido ainda.</span>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={`/clients/${clientId}/forms/${r.id}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: 'var(--color-text)',
                }}
              >
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(r.filledAt)}</strong>
                <span style={{ overflowWrap: 'anywhere' }}>{r.formName}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  {r.answeredCount} de {r.questionCount} respondidas
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {choosing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Qual formulário?</span>
          {forms.isLoading ? <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando…</span> : null}
          {forms.data && forms.data.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Você ainda não tem formulários. <Link to="/formularios">Criar em Formulários</Link>.
            </span>
          ) : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(forms.data ?? []).map((f) => (
              <Button key={f.id} size="small" variant="secondary" onClick={() => navigate(`/clients/${clientId}/forms/new?form=${f.id}`)}>
                {f.name}
              </Button>
            ))}
            <Button size="small" variant="ghost" onClick={() => setChoosing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button onClick={() => setChoosing(true)}>Preencher formulário</Button>
        </div>
      )}
    </Card>
  );
}
