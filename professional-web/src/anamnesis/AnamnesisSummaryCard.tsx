import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { formatDate } from '../lib/format';
import { AnamnesisWizard } from './AnamnesisWizard';
import { summaryRows } from './options';

/**
 * Resumo da anamnese na ficha do paciente: objetivo, patologias, alergias, o que
 * está em uso e as restrições alimentares — o que o profissional precisa ter à
 * vista na consulta. É a ficha como foi preenchida, sem texto gerado; a ficha
 * completa abre no botão.
 */
export function AnamnesisSummaryCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ['anamnesis-summary', clientId], queryFn: () => api.getAnamnesis(clientId) });

  const rows = data ? summaryRows(data.anamnesis) : [];
  const started = !!data?.anamnesis.updatedAt;
  const status = !data
    ? null
    : data.anamnesis.completedAt
      ? `Concluída em ${formatDate(data.anamnesis.completedAt)}`
      : started
        ? 'Em andamento'
        : 'Ainda não preenchida';

  return (
    <Card title="Anamnese">
      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando anamnese…</div>
      ) : isError || !data ? (
        <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>
          Não foi possível carregar a anamnese.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{status}</div>
          {rows.length > 0 ? (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', columnGap: 16, rowGap: 8, fontSize: 14 }}>
              {rows.map((row) => (
                <div key={row.label} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 11, textTransform: 'uppercase', paddingTop: 3, color: row.alert ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontWeight: row.alert ? 700 : 400 }}>
                    {row.label}
                  </dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap', fontWeight: row.alert ? 600 : 400 }}>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : started ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum objetivo, patologia, alergia, medicamento ou restrição informado até agora.</div>
          ) : null}
          <div>
            <Button variant={started ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
              {started ? 'Abrir anamnese' : 'Preencher anamnese'}
            </Button>
          </div>
        </>
      )}

      {open ? (
        <AnamnesisWizard
          clientId={clientId}
          onClose={() => {
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['anamnesis-summary', clientId] });
            // Nascimento, sexo e telefone da ficha gravam no cadastro do paciente.
            void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
          }}
        />
      ) : null}
    </Card>
  );
}
