import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../lib/format';
import type { TrashItem, TrashKind } from '../types/api';
import styles from './ClientsListPage.module.css';

const KIND_LABEL: Record<TrashKind, string> = {
  diet: 'Dieta',
  workout: 'Treino',
  diet_template: 'Modelo de dieta',
  workout_template: 'Modelo de treino',
  form: 'Formulário',
  report: 'Relatório',
  form_response: 'Formulário preenchido',
};

const FILTERS: Array<{ id: string; label: string; kinds: TrashKind[] | null }> = [
  { id: 'all', label: 'Tudo', kinds: null },
  { id: 'plans', label: 'Dietas e treinos', kinds: ['diet', 'workout'] },
  { id: 'templates', label: 'Modelos', kinds: ['diet_template', 'workout_template'] },
  { id: 'forms', label: 'Formulários', kinds: ['form', 'form_response'] },
  { id: 'reports', label: 'Relatórios', kinds: ['report'] },
];

/** Aviso depois de restaurar: o que voltou e onde aparece de novo. */
const RESTORED: Record<TrashKind, string> = {
  diet: 'Dieta restaurada. Ela aparece de novo na aba Dieta do paciente.',
  workout: 'Treino restaurado. Ele aparece de novo na aba Treino do paciente.',
  diet_template: 'Modelo restaurado. Ele aparece de novo em Modelos.',
  workout_template: 'Modelo restaurado. Ele aparece de novo em Modelos.',
  form: 'Formulário restaurado. Ele aparece de novo em Formulários.',
  report: 'Relatório restaurado. Ele aparece de novo na aba Relatórios do paciente.',
  form_response: 'Formulário preenchido restaurado. Ele aparece de novo na ficha do paciente.',
};

export function itemTitle(item: TrashItem): string {
  if (item.kind !== 'report') return item.title;
  const who = item.audience === 'client' ? 'para o paciente' : 'profissional';
  return item.evaluatedAt ? `Relatório ${who} · avaliação de ${formatDate(item.evaluatedAt)}` : `Relatório ${who}`;
}

/** Por que não dá para apagar de vez (mostrado no lugar do botão). */
function keptReason(item: TrashItem): string {
  if (item.kind === 'diet' || item.kind === 'workout') return 'Fica guardado no histórico do paciente.';
  return 'Tem respostas de pacientes; fica guardado.';
}

function apiMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return 'Não foi possível concluir agora. Tente de novo.';
}

/** Lixeira: tudo o que foi excluído no painel. Nada some sozinho; restaurar devolve ao lugar de origem. */
export function TrashPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState(FILTERS[0]);
  const [toPurge, setToPurge] = useState<TrashItem | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['trash'], queryFn: api.listTrash });
  // Restaurar ou apagar mexe em listas de várias telas (dieta, modelos, relatórios…).
  const refreshAll = () => queryClient.invalidateQueries();

  const restore = useMutation({
    mutationFn: (item: TrashItem) => api.restoreTrashItem(item.kind, item.id),
    onSuccess: (_void, item) => {
      setNotice({ text: RESTORED[item.kind] });
      return refreshAll();
    },
    onError: (err) => setNotice({ text: apiMessage(err), error: true }),
  });

  async function purge(item: TrashItem) {
    try {
      await api.purgeTrashItem(item.kind, item.id);
      setNotice({ text: `"${itemTitle(item)}" foi apagado de vez.` });
    } catch (err) {
      setNotice({ text: apiMessage(err), error: true });
    }
    await refreshAll();
  }

  const rows = (data ?? []).filter((item) => !filter.kinds || filter.kinds.includes(item.kind));

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Lixeira</h1>
          <p className={styles.subtitle}>
            O que você excluiu no painel fica aqui até você restaurar ou apagar de vez. Nada some sozinho.
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Tipo de item" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const count = f.kinds ? (data ?? []).filter((i) => f.kinds!.includes(i.kind)).length : (data ?? []).length;
          const active = f.id === filter.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 999,
                padding: '6px 14px',
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
                background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
              }}
            >
              {f.label}
              {data ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {notice ? (
        <div
          role={notice.error ? 'alert' : 'status'}
          style={{
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 8,
            background: notice.error ? 'var(--color-danger-light, #fdecec)' : 'var(--color-primary-light)',
          }}
        >
          {notice.text}
        </div>
      ) : null}

      {isLoading ? (
        <EmptyState title="Carregando a lixeira…" />
      ) : isError ? (
        <EmptyState title="Não foi possível abrir a lixeira" description="Confira a conexão e recarregue a página." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="A lixeira está vazia"
          description={filter.kinds ? 'Nada deste tipo foi excluído.' : 'Quando você excluir uma dieta, treino, modelo, formulário ou relatório, ele aparece aqui.'}
        />
      ) : (
        <ul aria-label="Itens na lixeira" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
              }}
            >
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {KIND_LABEL[item.kind]}
                </div>
                <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{itemTitle(item)}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {item.clientId && item.clientName ? (
                    <>
                      <Link to={`/clients/${item.clientId}`}>{item.clientName}</Link> ·{' '}
                    </>
                  ) : null}
                  excluído em {formatDate(item.deletedAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => restore.mutate(item)}
                  loading={restore.isPending && restore.variables?.id === item.id}
                  aria-label={`Restaurar ${itemTitle(item)}`}
                >
                  Restaurar
                </Button>
                {item.canPurge ? (
                  <Button size="small" variant="ghost" onClick={() => setToPurge(item)} aria-label={`Apagar de vez ${itemTitle(item)}`}>
                    Apagar de vez
                  </Button>
                ) : (
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{keptReason(item)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {toPurge ? (
        <ConfirmDialog
          title="Apagar de vez?"
          description={`"${itemTitle(toPurge)}" será apagado definitivamente e não poderá ser recuperado.`}
          confirmLabel="Apagar de vez"
          danger
          onConfirm={() => purge(toPurge)}
          onClose={() => setToPurge(null)}
        />
      ) : null}
    </>
  );
}
