import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ExercisePreview } from '../components/ExercisePreview';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { GifCandidate, WithoutGifItem } from '../types/api';
import styles from './ExerciseLibrary.module.css';

const usageText = (item: WithoutGifItem) =>
  item.uses === 0
    ? 'Não está em nenhum treino'
    : `Em ${item.uses} ${item.uses === 1 ? 'treino' : 'treinos'} · ${item.clients} ${item.clients === 1 ? 'paciente' : 'pacientes'}`;

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Escolher o GIF: sugestões (ou busca na biblioteca), o GIF da escolhida e "Usar este GIF". */
function ChooseGifModal({ item, onClose, onLinked }: { item: WithoutGifItem; onClose: () => void; onLinked: (from: GifCandidate) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GifCandidate | null>(item.suggestions[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());
  const found = useQuery({
    queryKey: ['exercise-library-gif-search', debounced],
    queryFn: () => api.listExerciseLibrary({ search: debounced, pageSize: 30 }),
    enabled: debounced.length >= 2,
  });
  const results: GifCandidate[] =
    debounced.length >= 2
      ? (found.data?.items ?? []).filter((e) => e.scope === 'global' && e.gifUrl).map((e) => ({ id: e.id, name: e.name, section: e.section, gifUrl: e.gifUrl }))
      : item.suggestions;

  const link = useMutation({
    mutationFn: (from: GifCandidate) => api.linkLibraryGif(item.id, from.id),
    onSuccess: (_, from) => onLinked(from),
    onError: (err) => setError(apiErrorMessage(err, 'Não foi possível usar este GIF.')),
  });

  return (
    <Modal
      title={`GIF para "${item.name}"`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => selected && link.mutate(selected)} loading={link.isPending} disabled={!selected}>
            Usar este GIF
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          O nome do exercício e os treinos continuam iguais. O paciente passa a ver este GIF.
        </p>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <input placeholder="Procurar outro na biblioteca..." aria-label="Procurar outro exercício na biblioteca" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {debounced.length >= 2 && found.isLoading ? <span>Procurando…</span> : null}
        {results.length === 0 && !(debounced.length >= 2 && found.isLoading) ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>{debounced.length >= 2 ? 'Nada encontrado com GIF. Tente outro nome.' : 'Sem sugestão. Procure pelo nome acima.'}</span>
        ) : null}
        <div role="radiogroup" aria-label="Exercícios com GIF" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected?.id === c.id}
              className={[styles.chip, selected?.id === c.id ? styles.chipActive : ''].join(' ')}
              style={{ whiteSpace: 'normal', textAlign: 'left' }}
              onClick={() => setSelected(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {selected ? (
          <div style={{ maxWidth: 420 }}>
            <ExercisePreview exercise={{ name: selected.name, muscleGroup: null, equipment: null, imageUrl: selected.gifUrl }} />
          </div>
        ) : null}
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * Aba "Sem GIF": exercícios que o profissional criou e ainda não têm GIF. Cada um pode passar a mostrar o
 * GIF de um exercício da biblioteca — sem mudar nome, treinos publicados nem cargas registradas.
 */
export type LinkedGifs = Record<string, GifCandidate>;

/** Quantos da lista ainda estão sem GIF (os já resolvidos nesta visita não contam). */
export const pendingCount = (items: WithoutGifItem[], linked: LinkedGifs) => items.filter((i) => !linked[i.id]).length;

export function WithoutGifTab({
  items,
  loading,
  linked,
  setLinked,
}: {
  items: WithoutGifItem[];
  loading: boolean;
  /** Os já resolvidos ficam na lista (com "Desfazer") enquanto a aba está aberta; quem usa recarrega a lista ao sair. */
  linked: LinkedGifs;
  setLinked: React.Dispatch<React.SetStateAction<LinkedGifs>>;
}) {
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState<WithoutGifItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlink = useMutation({
    mutationFn: (id: string) => api.unlinkLibraryGif(id),
    onSuccess: (_, id) => {
      setLinked(({ [id]: _removed, ...rest }) => rest);
      void queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'Não foi possível desfazer.')),
  });

  if (loading) return <EmptyState title="Carregando…" />;
  if (items.length === 0) return <EmptyState title="Todos os seus exercícios têm GIF" description="Quando você criar um exercício sem GIF, ele aparece aqui." />;

  const pending = pendingCount(items, linked);
  return (
    <>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {pending === 0
          ? 'Pronto: todos os exercícios desta lista já têm GIF.'
          : `${pending} ${pending === 1 ? 'exercício criado por você ainda não tem' : 'exercícios criados por você ainda não têm'} GIF. Escolha um GIF da biblioteca para cada um: o nome e os treinos continuam iguais.`}
      </p>
      {error ? (
        <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      <ul className={styles.list}>
        {items.map((item) => {
          const done = linked[item.id];
          return (
            <li key={item.id} className={styles.row}>
              <span className={styles.avatar} aria-hidden="true" style={done ? { background: 'var(--color-success-light, #e3f6ea)', color: 'var(--color-success, #1e7a46)' } : undefined}>
                {done ? '✓' : 'GIF'}
              </span>
              <div className={styles.body}>
                <span className={styles.name}>{item.name}</span>
                <div className={styles.tags}>
                  <span className={styles.tag}>{usageText(item)}</span>
                  {done ? (
                    <span className={styles.tag} style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      GIF de: {done.name}
                    </span>
                  ) : item.suggestions[0] ? (
                    <span className={styles.tag}>Sugestão: {item.suggestions[0].name}</span>
                  ) : (
                    <span className={styles.noGroup}>Sem sugestão</span>
                  )}
                </div>
              </div>
              <div className={styles.actions}>
                {done ? (
                  <Button size="small" variant="ghost" onClick={() => unlink.mutate(item.id)} loading={unlink.isPending && unlink.variables === item.id}>
                    Desfazer
                  </Button>
                ) : (
                  <Button size="small" variant="secondary" onClick={() => setChoosing(item)}>
                    Escolher GIF
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {choosing ? (
        <ChooseGifModal
          item={choosing}
          onClose={() => setChoosing(null)}
          onLinked={(from) => {
            setLinked((map) => ({ ...map, [choosing.id]: from }));
            setChoosing(null);
            setError(null);
            void queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
          }}
        />
      ) : null}
    </>
  );
}
