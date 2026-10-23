import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime } from '../lib/format';
import type { ReportOverviewItem } from '../types/api';
import { GenerateReportModal } from './tabs/ReportsTab';
import styles from './ClientsListPage.module.css';

const AUDIENCE_LABEL: Record<string, string> = { professional: 'Profissional (completo)', client: 'Paciente' };

/** Primeiro passo do "Gerar relatório" fora da ficha: escolher o paciente (só quem já tem avaliação). */
function ChoosePatientModal({ onClose, onChoose }: { onClose: () => void; onChoose: (clientId: string) => void }) {
  const [clientId, setClientId] = useState('');
  const clients = useQuery({ queryKey: ['clients', '', 'reports-menu'], queryFn: () => api.listClients({ status: 'all', pageSize: 100 }) });
  const summary = useQuery({ queryKey: ['evaluations-summary'], queryFn: api.listEvaluationSummary });
  const evaluated = new Set((summary.data ?? []).map((row) => row.clientId));
  const options = (clients.data?.items ?? []).filter((client) => client.status !== 'archived' && evaluated.has(client.id));
  const loading = clients.isLoading || summary.isLoading;

  return (
    <Modal
      title="Gerar relatório"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onChoose(clientId)} disabled={!clientId}>
            Continuar
          </Button>
        </>
      }
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Paciente</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <option value="">{loading ? 'Carregando…' : 'Selecione…'}</option>
          {options.map((client) => (
            <option key={client.id} value={client.id}>
              {client.user.fullName}
            </option>
          ))}
        </select>
      </label>
      {!loading && options.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum paciente com avaliação ainda. O relatório sai de uma avaliação física.</div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Só aparecem pacientes que já têm avaliação física.</div>
      )}
    </Modal>
  );
}

/** Relatórios: todos os relatórios de avaliação de todos os pacientes num lugar só. */
export function ReportsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [generateFor, setGenerateFor] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reports-all'],
    queryFn: () => api.listAllReports(),
    // Enquanto algum PDF está sendo gerado, confere de novo a cada 3 s.
    refetchInterval: (query) => (query.state.data?.items.some((r) => r.status === 'queued' || r.status === 'generating') ? 3000 : false),
  });

  const invalidate = (clientId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['reports-all'] });
    if (clientId) queryClient.invalidateQueries({ queryKey: ['reports', clientId] });
  };

  const releaseMutation = useMutation({
    mutationFn: (row: ReportOverviewItem) => api.setReportRelease(row.clientId, row.id, !row.releasedToClientAt),
    onSuccess: (_data, row) => invalidate(row.clientId),
  });

  async function handleDownload(row: ReportOverviewItem) {
    setDownloadError(null);
    try {
      const { url } = await api.getReportDownloadUrl(row.clientId, row.id);
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
      window.open(`${apiBase}${url}`, '_blank');
    } catch {
      setDownloadError('Não foi possível gerar o link de download.');
    }
  }

  const term = search.trim().toLocaleLowerCase('pt-BR');
  const rows = (data?.items ?? []).filter((row) => !term || row.clientName.toLocaleLowerCase('pt-BR').includes(term));

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.subtitle}>Relatórios de avaliação física de todos os pacientes</p>
        </div>
        <Button onClick={() => setChoosing(true)}>+ Gerar relatório</Button>
      </div>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input placeholder="Filtrar por paciente…" aria-label="Filtrar por paciente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {downloadError ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{downloadError}</div> : null}

      <DataTable
        loading={isLoading}
        rows={rows}
        rowKey={(row) => row.id}
        emptyTitle={search ? 'Nenhum relatório desse paciente' : 'Nenhum relatório gerado ainda'}
        columns={[
          {
            key: 'patient',
            label: 'Paciente',
            render: (row) => (
              <button
                type="button"
                onClick={() => navigate(`/clients/${row.clientId}/reports`)}
                style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--color-primary-dark)', cursor: 'pointer', textAlign: 'left' }}
              >
                {row.clientName}
              </button>
            ),
          },
          { key: 'evaluation', label: 'Avaliação de', render: (row) => formatDate(row.evaluatedAt) },
          { key: 'date', label: 'Gerado em', render: (row) => (row.generatedAt ? formatDateTime(row.generatedAt) : '—') },
          { key: 'audience', label: 'Para', render: (row) => AUDIENCE_LABEL[row.audience] },
          {
            key: 'status',
            label: 'Situação',
            render: (row) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                <StatusBadge status={row.status} />
                {row.audience === 'client' && row.status === 'ready' ? (
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{row.releasedToClientAt ? 'Liberado no app' : 'Ainda não liberado'}</span>
                ) : null}
                {row.status === 'failed' && row.failureReason ? (
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 220 }}>{row.failureReason}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'actions',
            label: '',
            render: (row) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {row.status === 'ready' ? (
                  <Button size="small" variant="ghost" onClick={() => handleDownload(row)}>
                    Baixar
                  </Button>
                ) : null}
                {row.audience === 'client' && row.status === 'ready' ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => releaseMutation.mutate(row)}
                    loading={releaseMutation.isPending && releaseMutation.variables?.id === row.id}
                  >
                    {row.releasedToClientAt ? 'Retirar do app' : 'Liberar no app'}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {choosing ? (
        <ChoosePatientModal
          onClose={() => setChoosing(false)}
          onChoose={(clientId) => {
            setChoosing(false);
            setGenerateFor(clientId);
          }}
        />
      ) : null}
      {generateFor ? <GenerateReportModal clientId={generateFor} onClose={() => setGenerateFor(null)} onDone={() => invalidate(generateFor)} /> : null}
    </>
  );
}
