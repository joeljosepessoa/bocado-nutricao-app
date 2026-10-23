import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PatientRow, type RowBadge } from '../components/PatientRow';
import { formatDate } from '../lib/format';
import type { EvaluationSummaryRow } from '../types/api';
import styles from './ClientsListPage.module.css';

function badgeFor(summary: EvaluationSummaryRow | undefined): RowBadge {
  if (!summary) return { label: 'Sem avaliação', color: 'var(--color-text-secondary)', background: 'var(--color-bg)' };
  const count = summary.total === 1 ? '1 avaliação' : `${summary.total} avaliações`;
  return { label: `Última em ${formatDate(summary.lastEvaluatedAt)} · ${count}`, color: 'var(--color-success)', background: 'var(--color-success-light)' };
}

/** Avaliação física: escolhe o paciente para ver o histórico ou começar uma avaliação nova. */
export function EvaluationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const clients = useQuery({
    queryKey: ['clients', search, 'evaluations-menu'],
    queryFn: () => api.listClients({ search: search || undefined, status: 'all', pageSize: 100 }),
  });
  const summary = useQuery({ queryKey: ['evaluations-summary'], queryFn: api.listEvaluationSummary });
  const byClient = new Map((summary.data ?? []).map((row) => [row.clientId, row]));
  // Paciente arquivado não recebe avaliação nova.
  const rows = (clients.data?.items ?? []).filter((client) => client.status !== 'archived');

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Avaliação</h1>
          <p className={styles.subtitle}>Avaliação física de cada paciente: medidas, dobras, bioimpedância e fotos</p>
        </div>
      </div>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input placeholder="Buscar paciente…" aria-label="Buscar paciente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {clients.isLoading ? (
        <EmptyState title="Carregando pacientes…" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum paciente encontrado" description={search ? 'Tente outro nome ou e-mail.' : 'Cadastre um paciente em Pacientes para fazer a avaliação.'} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((client) => {
            const row = byClient.get(client.id);
            return (
              <PatientRow
                key={client.id}
                name={client.user.fullName}
                email={client.user.email}
                badge={summary.isLoading ? undefined : badgeFor(row)}
                onOpen={() => navigate(`/clients/${client.id}/evaluations`)}
                openLabel={`Ver avaliações de ${client.user.fullName}`}
                actions={
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {row ? (
                      <Button size="small" variant="ghost" onClick={() => navigate(`/clients/${client.id}/evaluations/${row.lastEvaluationId}`)}>
                        Ver última
                      </Button>
                    ) : null}
                    <Button size="small" onClick={() => navigate(`/clients/${client.id}/evaluations/new`)} aria-label={`Nova avaliação de ${client.user.fullName}`}>
                      + Nova avaliação
                    </Button>
                  </div>
                }
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
