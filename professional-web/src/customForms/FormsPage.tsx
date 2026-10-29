import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../lib/format';
import type { CustomFormSummary } from '../types/api';
import styles from '../pages/ClientsListPage.module.css';
import { STARTER_FORMS } from './formModel';

const card = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 16,
  minWidth: 0,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Formulários próprios: você cria as perguntas e preenche na página do paciente (Visão geral). */
export function FormsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [trash, setTrash] = useState(false);
  const [toDelete, setToDelete] = useState<CustomFormSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['custom-forms', trash], queryFn: () => api.listForms(trash) });
  const forms = data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['custom-forms'] });

  const duplicate = useMutation({
    mutationFn: (f: CustomFormSummary) => api.duplicateForm(f.id),
    onSuccess: (copy) => {
      setNotice(`Cópia criada: “${copy.name}”.`);
      void refresh();
    },
  });
  const restore = useMutation({
    mutationFn: (f: CustomFormSummary) => api.restoreForm(f.id),
    onSuccess: (f) => {
      setNotice(`“${f.name}” voltou para os formulários.`);
      void refresh();
    },
  });

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Formulários</h1>
          <p className={styles.subtitle}>Suas próprias perguntas para preencher na consulta. Para usar, abra o paciente → Visão geral → Formulários.</p>
        </div>
        <Button onClick={() => navigate('/formularios/novo')}>+ Novo formulário</Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!trash ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Começar de um modelo pronto:</span>
            {STARTER_FORMS.map((s) => (
              <Button key={s.key} size="small" variant="secondary" onClick={() => navigate(`/formularios/novo?modelo=${s.key}`)}>
                {s.name}
              </Button>
            ))}
          </>
        ) : null}
        <Button size="small" variant={trash ? 'secondary' : 'ghost'} onClick={() => setTrash((t) => !t)} style={{ marginLeft: 'auto' }}>
          {trash ? '← Voltar aos formulários' : 'Lixeira'}
        </Button>
      </div>

      {notice ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          {notice}
        </div>
      ) : null}

      {isLoading ? (
        <EmptyState title="Carregando formulários…" />
      ) : forms.length === 0 ? (
        <EmptyState
          title={trash ? 'A lixeira está vazia' : 'Nenhum formulário ainda'}
          description={trash ? undefined : 'Crie do zero ou comece pelo Check-in semanal ou pelo PAR-Q e ajuste como quiser.'}
          action={trash ? undefined : <Button onClick={() => navigate('/formularios/novo')}>+ Novo formulário</Button>}
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {forms.map((f) => (
            <li key={f.id} style={card}>
              <button
                type="button"
                disabled={trash}
                onClick={() => navigate(`/formularios/${f.id}`)}
                style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: trash ? 'default' : 'pointer' }}
              >
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5, overflowWrap: 'anywhere' }}>{f.name}</span>
                {f.description ? (
                  <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{f.description}</span>
                ) : null}
              </button>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {plural(f.questionCount, 'pergunta', 'perguntas')} · {plural(f.responseCount, 'preenchimento', 'preenchimentos')} ·{' '}
                {trash && f.deletedAt ? `excluído em ${formatDate(f.deletedAt)}` : `atualizado em ${formatDate(f.updatedAt)}`}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                {trash ? (
                  <Button size="small" variant="secondary" onClick={() => restore.mutate(f)} loading={restore.isPending && restore.variables?.id === f.id}>
                    Restaurar
                  </Button>
                ) : (
                  <>
                    <Button size="small" variant="secondary" onClick={() => navigate(`/formularios/${f.id}`)}>
                      Editar
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => duplicate.mutate(f)} loading={duplicate.isPending && duplicate.variables?.id === f.id}>
                      Duplicar
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => setToDelete(f)} aria-label={`Excluir ${f.name}`}>
                      Excluir
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDelete ? (
        <ConfirmDialog
          title="Excluir formulário"
          description={`“${toDelete.name}” vai para a lixeira. Os formulários já preenchidos nos pacientes continuam lá.`}
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await api.deleteForm(toDelete.id);
            setNotice(`“${toDelete.name}” foi para a lixeira.`);
            await refresh();
          }}
          onClose={() => setToDelete(null)}
        />
      ) : null}
    </>
  );
}
