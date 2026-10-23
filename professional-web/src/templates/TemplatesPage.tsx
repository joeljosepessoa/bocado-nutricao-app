import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { formatDate } from '../lib/format';
import type { TemplateKind, TemplateSummary } from '../types/api';
import styles from '../pages/ClientsListPage.module.css';
import { ApplyTemplateModal } from './ApplyTemplateModal';

const KINDS: Array<{ kind: TemplateKind; tab: string; param: string; path: string; noun: string }> = [
  { kind: 'diet', tab: 'Dietas', param: 'dietas', path: '/modelos/dietas', noun: 'dieta' },
  { kind: 'workout', tab: 'Treinos', param: 'treinos', path: '/modelos/treinos', noun: 'treino' },
];

function countsText(template: TemplateSummary): string {
  const days = template.counts.days === 1 ? '1 dia' : `${template.counts.days} dias`;
  if (template.kind === 'diet') {
    const meals = template.counts.meals ?? 0;
    return `${days} · ${meals === 1 ? '1 refeição' : `${meals} refeições`}`;
  }
  const exercises = template.counts.exercises ?? 0;
  return `${days} · ${exercises === 1 ? '1 exercício' : `${exercises} exercícios`}`;
}

/** Biblioteca de modelos: dietas e treinos sem paciente, prontos para reaproveitar ou atribuir. */
export function TemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const current = KINDS.find((k) => k.param === params.get('tipo')) ?? KINDS[0];
  const [trash, setTrash] = useState(false);
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState<TemplateSummary | null>(null);
  const [toDelete, setToDelete] = useState<TemplateSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['templates', current.kind, trash], queryFn: () => api.listTemplates(current.kind, trash) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates', current.kind] });

  const duplicate = useMutation({
    mutationFn: (t: TemplateSummary) => api.duplicateTemplate(t.kind, t.id),
    onSuccess: (copy) => {
      setNotice(`Cópia criada: "${copy.name}".`);
      return invalidate();
    },
  });
  const restore = useMutation({
    mutationFn: (t: TemplateSummary) => api.restoreTemplate(t.kind, t.id),
    onSuccess: (restored) => {
      setNotice(`"${restored.name}" voltou para a biblioteca.`);
      return invalidate();
    },
  });

  const term = search.trim().toLocaleLowerCase('pt-BR');
  const rows = (data ?? []).filter((t) => !term || `${t.name} ${t.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(term));

  function switchKind(param: string) {
    setParams({ tipo: param }, { replace: true });
    setTrash(false);
    setNotice(null);
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Modelos</h1>
          <p className={styles.subtitle}>Dietas e treinos prontos para reaproveitar: guarde na biblioteca ou atribua a um paciente.</p>
        </div>
        <Button onClick={() => navigate(`${current.path}/novo`)}>+ Novo modelo de {current.noun}</Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="tablist" aria-label="Tipo de modelo" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={k.kind === current.kind}
              onClick={() => switchKind(k.param)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '6px 16px',
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
                background: k.kind === current.kind ? 'var(--color-surface)' : 'transparent',
                color: k.kind === current.kind ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: k.kind === current.kind ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {k.tab}
            </button>
          ))}
        </div>
        <label className={styles.search} style={{ minWidth: 200 }}>
          <Icon name="search" size={16} />
          <input placeholder="Buscar modelo…" aria-label="Buscar modelo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Button variant={trash ? 'secondary' : 'ghost'} onClick={() => setTrash((t) => !t)}>
          {trash ? '← Voltar aos modelos' : 'Lixeira'}
        </Button>
      </div>

      {notice ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          {notice}
        </div>
      ) : null}
      {trash ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Modelos excluídos ficam aqui. Restaure para voltar a usar.</div>
      ) : null}

      {isLoading ? (
        <EmptyState title="Carregando modelos…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={trash ? 'A lixeira está vazia' : search ? 'Nenhum modelo encontrado' : `Nenhum modelo de ${current.noun} ainda`}
          description={
            trash || search
              ? undefined
              : `Monte um ${current.noun} uma vez e reaproveite com vários pacientes. O modelo pode só ficar guardado aqui ou ser atribuído a um paciente.`
          }
          action={
            trash || search ? undefined : <Button onClick={() => navigate(`${current.path}/novo`)}>+ Novo modelo de {current.noun}</Button>
          }
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {rows.map((t) => (
            <li
              key={t.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                minWidth: 0,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
              }}
            >
              <button
                type="button"
                disabled={trash}
                onClick={() => navigate(`${current.path}/${t.id}`)}
                style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: trash ? 'default' : 'pointer' }}
              >
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5, overflowWrap: 'anywhere' }}>{t.name}</span>
                {t.description ? (
                  <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{t.description}</span>
                ) : null}
              </button>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {countsText(t)} · {trash && t.deletedAt ? `excluído em ${formatDate(t.deletedAt)}` : `atualizado em ${formatDate(t.updatedAt)}`}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                {trash ? (
                  <Button size="small" variant="secondary" onClick={() => restore.mutate(t)} loading={restore.isPending && restore.variables?.id === t.id}>
                    Restaurar
                  </Button>
                ) : (
                  <>
                    <Button size="small" onClick={() => setApplying(t)}>
                      Atribuir a paciente
                    </Button>
                    <Button size="small" variant="secondary" onClick={() => navigate(`${current.path}/${t.id}`)}>
                      Editar
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => duplicate.mutate(t)} loading={duplicate.isPending && duplicate.variables?.id === t.id}>
                      Duplicar
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => setToDelete(t)} aria-label={`Excluir ${t.name}`}>
                      Excluir
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {applying ? (
        <ApplyTemplateModal
          kind={applying.kind}
          template={applying}
          onClose={() => setApplying(null)}
          onApplied={(clientId) => navigate(`/clients/${clientId}/${applying.kind === 'diet' ? 'diet' : 'workout'}`, { state: { templateApplied: applying.name } })}
        />
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Excluir modelo?"
          description={`"${toDelete.name}" vai para a lixeira. Dá para restaurar depois. Dietas e treinos já atribuídos a pacientes não mudam.`}
          confirmLabel="Mandar para a lixeira"
          danger
          onConfirm={async () => {
            await api.deleteTemplate(toDelete.kind, toDelete.id);
            setNotice(`"${toDelete.name}" foi para a lixeira.`);
            await invalidate();
          }}
          onClose={() => setToDelete(null)}
        />
      ) : null}
    </>
  );
}
