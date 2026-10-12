import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { AnamnesisWizard } from '../anamnesis/AnamnesisWizard';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { formatDate, initials } from '../lib/format';
import type { AnamnesisStatus } from '../types/api';
import styles from './ClientsListPage.module.css';

type Situation = { label: string; color: string; background: string };

function situation(status: AnamnesisStatus | undefined): Situation {
  if (!status) return { label: 'Não iniciada', color: 'var(--color-text-secondary)', background: 'var(--color-bg)' };
  if (status.completedAt) return { label: `Concluída em ${formatDate(status.completedAt)}`, color: 'var(--color-success)', background: 'var(--color-success-light)' };
  return { label: 'Em andamento', color: 'var(--color-primary-dark)', background: 'var(--color-primary-light)' };
}

/** Anamnese: escolhe o paciente e abre a ficha em 12 etapas. */
export function AnamnesisPage() {
  const [search, setSearch] = useState('');
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['clients', search, 'anamnesis'],
    queryFn: () => api.listClients({ search: search || undefined, status: 'all', pageSize: 100 }),
  });
  const statuses = useQuery({ queryKey: ['anamneses'], queryFn: api.listAnamneses });
  const byClient = new Map((statuses.data ?? []).map((status) => [status.clientId, status]));
  // Paciente arquivado não recebe anamnese nova.
  const rows = (clients.data?.items ?? []).filter((client) => client.status !== 'archived');

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Anamnese</h1>
          <p className={styles.subtitle}>Avaliação completa do paciente em etapas</p>
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
        <EmptyState title="Nenhum paciente encontrado" description={search ? 'Tente outro nome ou e-mail.' : 'Cadastre um paciente em Pacientes para preencher a anamnese.'} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((client) => {
            const state = situation(byClient.get(client.id));
            return (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => setOpenClientId(client.id)}
                  aria-label={`Abrir anamnese de ${client.user.fullName}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 18px',
                    textAlign: 'left',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {initials(client.user.fullName)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{client.user.fullName}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-secondary)' }}>{client.user.email}</span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: state.color, background: state.background, whiteSpace: 'nowrap' }}>
                    {state.label}
                  </span>
                  <span aria-hidden="true" style={{ color: 'var(--color-text-secondary)', fontSize: 18 }}>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openClientId ? <AnamnesisWizard clientId={openClientId} onClose={() => setOpenClientId(null)} /> : null}
    </>
  );
}
