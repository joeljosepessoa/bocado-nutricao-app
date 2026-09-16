import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import type { ReportSummary } from '../../types/api';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { formatBytes, formatDate, formatDateTime } from '../../lib/format';

const AUDIENCE_LABEL: Record<string, string> = { professional: 'Profissional', client: 'Cliente' };

function GenerateReportModal({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: () => void }) {
  const [evaluationId, setEvaluationId] = useState('');
  const [audience, setAudience] = useState<'professional' | 'client'>('professional');
  const [error, setError] = useState<string | null>(null);

  const { data: evaluations } = useQuery({ queryKey: ['evaluations', clientId], queryFn: () => api.listEvaluations(clientId) });

  const mutation = useMutation({
    mutationFn: () => api.generateReport(clientId, evaluationId, audience),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'Não foi possível gerar o relatório.');
    },
  });

  return (
    <Modal
      title="Gerar relatório"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!evaluationId}>
            Gerar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Avaliação</span>
          <select value={evaluationId} onChange={(e) => setEvaluationId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
            <option value="">Selecione…</option>
            {(evaluations?.items ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {formatDate(ev.evaluatedAt)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Público</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'professional' | 'client')} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
            <option value="professional">Profissional (completo)</option>
            <option value="client">Cliente (restrito)</option>
          </select>
        </label>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          O relatório "cliente" só pode ser gerado se a avaliação já estiver liberada.
        </div>
        {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}
      </div>
    </Modal>
  );
}

export function ReportsTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [showGenerate, setShowGenerate] = useState(false);
  const [toDelete, setToDelete] = useState<ReportSummary | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', clientId],
    queryFn: () => api.listReports(clientId!),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reports', clientId] });

  const releaseMutation = useMutation({
    mutationFn: ({ reportId, released }: { reportId: string; released: boolean }) => api.setReportRelease(clientId!, reportId, released),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (reportId: string) => api.deleteReport(clientId!, reportId),
    onSuccess: invalidate,
  });

  async function handleDownload(reportId: string) {
    try {
      const { url } = await api.getReportDownloadUrl(clientId!, reportId);
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
      window.open(`${apiBase}${url}`, '_blank');
    } catch {
      setDownloadError('Não foi possível gerar o link de download.');
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Relatórios</h2>
        <Button onClick={() => setShowGenerate(true)}>+ Gerar relatório</Button>
      </div>

      {downloadError ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{downloadError}</div> : null}

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        emptyTitle="Nenhum relatório gerado ainda"
        columns={[
          { key: 'date', label: 'Gerado em', render: (row) => formatDateTime(row.generatedAt) },
          { key: 'audience', label: 'Público', render: (row) => AUDIENCE_LABEL[row.audience] },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          { key: 'size', label: 'Tamanho', render: (row) => formatBytes(row.sizeBytes) },
          {
            key: 'release',
            label: 'Liberação',
            render: (row) =>
              row.audience === 'client' ? (
                <StatusBadge status={row.releasedToClientAt ? 'published' : 'draft'} />
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
              ),
          },
          {
            key: 'actions',
            label: '',
            render: (row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                {row.status === 'ready' ? (
                  <Button size="small" variant="ghost" onClick={() => handleDownload(row.id)}>
                    Baixar
                  </Button>
                ) : null}
                {row.audience === 'client' ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => releaseMutation.mutate({ reportId: row.id, released: !row.releasedToClientAt })}
                    loading={releaseMutation.isPending}
                  >
                    {row.releasedToClientAt ? 'Retirar' : 'Liberar'}
                  </Button>
                ) : null}
                <Button size="small" variant="danger" onClick={() => setToDelete(row)}>
                  Excluir
                </Button>
              </div>
            ),
          },
        ]}
      />

      {showGenerate ? <GenerateReportModal clientId={clientId!} onClose={() => setShowGenerate(false)} onDone={invalidate} /> : null}

      {toDelete ? (
        <ConfirmDialog
          title="Excluir relatório"
          description="O arquivo será removido permanentemente. Esta ação não pode ser desfeita."
          danger
          confirmLabel="Excluir"
          onConfirm={() => deleteMutation.mutateAsync(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      ) : null}
    </>
  );
}
