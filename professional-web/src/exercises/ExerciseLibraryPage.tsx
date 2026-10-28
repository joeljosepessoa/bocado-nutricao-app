import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ExercisePreview } from '../components/ExercisePreview';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { NewExerciseForm } from '../components/NewExerciseForm';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { ExerciseLibraryItem, ExercisePreset } from '../types/api';
import styles from './ExerciseLibrary.module.css';
import { SETS_SUGGESTIONS, setsText, type SetsSuggestion } from './presetText';
import { pendingCount, WithoutGifTab, type LinkedGifs } from './WithoutGifTab';

const PAGE_SIZE = 30;
const MAIN_GROUPS = 8;
const NO_GROUP = '__sem_grupo__';

const initialsOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\d/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toLocaleUpperCase('pt-BR'))
    .join('') || name.slice(0, 2).toLocaleUpperCase('pt-BR');

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** "+ Preset": escolhe uma das 3 sugestões (ou ajusta) e guarda "exercício + séries". */
function PresetModal({ exercise, initial, onClose, onSaved }: { exercise: ExerciseLibraryItem; initial: SetsSuggestion; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<SetsSuggestion>(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.createExercisePreset({ exerciseId: exercise.id, ...value }),
    onSuccess: onSaved,
    onError: (err) => setError(apiErrorMessage(err, 'Não foi possível salvar o preset.')),
  });
  const num = (text: string) => (text.trim() === '' ? null : Number(text));
  const field = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 8px', width: 72, font: 'inherit' } as const;

  return (
    <Modal
      title={`Preset — ${exercise.name}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Salvar preset
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="radiogroup" aria-label="Sugestões de séries" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SETS_SUGGESTIONS.map((s) => {
            const active = setsText(s) === setsText(value);
            return (
              <button key={setsText(s)} type="button" role="radio" aria-checked={active} className={[styles.chip, active ? styles.chipActive : ''].join(' ')} onClick={() => setValue(s)}>
                {setsText(s)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', fontSize: 13 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Séries
            <input aria-label="Séries" type="number" min={1} max={20} style={field} value={value.sets} onChange={(e) => setValue({ ...value, sets: Number(e.target.value) })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Repetições de
            <input aria-label="Repetições mínimas" type="number" min={1} style={field} value={value.repsMin ?? value.reps ?? ''} onChange={(e) => setValue({ ...value, reps: null, repsMin: num(e.target.value) })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            até
            <input aria-label="Repetições máximas" type="number" min={1} style={field} value={value.repsMax ?? ''} onChange={(e) => setValue({ ...value, reps: null, repsMax: num(e.target.value) })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Descanso (s)
            <input aria-label="Descanso em segundos" type="number" min={0} style={field} value={value.restSeconds ?? ''} onChange={(e) => setValue({ ...value, restSeconds: num(e.target.value) })} />
          </label>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          Fica em <strong>Meus presets</strong> e entra pronto nos treinos e modelos (botão "+ Do meu preset" no editor de treino).
        </div>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** "Editar": nome, grupos musculares (vários) e equipamento. */
function EditModal({ exercise, groupOptions, equipmentOptions, onClose, onSaved }: { exercise: ExerciseLibraryItem; groupOptions: string[]; equipmentOptions: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(exercise.name);
  const [groups, setGroups] = useState<string[]>(exercise.muscleGroups);
  const [newGroup, setNewGroup] = useState('');
  const [equipment, setEquipment] = useState(exercise.equipment ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.updateExercise(exercise.id, { name: name.trim(), muscleGroups: groups, equipment: equipment.trim() }),
    onSuccess: onSaved,
    onError: (err) => setError(apiErrorMessage(err, 'Não foi possível salvar.')),
  });
  const toggle = (g: string) => setGroups((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));
  const options = [...new Set([...groupOptions, ...groups])];
  const input = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', width: '100%', boxSizing: 'border-box' } as const;

  return (
    <Modal
      title="Editar exercício"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>Nome</strong>
          <input aria-label="Nome do exercício" style={input} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong>Grupos musculares</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {options.map((g) => (
              <button key={g} type="button" aria-pressed={groups.includes(g)} className={[styles.chip, groups.includes(g) ? styles.chipActive : ''].join(' ')} onClick={() => toggle(g)}>
                {g}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label="Outro grupo" placeholder="Outro grupo…" style={input} value={newGroup} maxLength={60} onChange={(e) => setNewGroup(e.target.value)} />
            <Button
              size="small"
              variant="secondary"
              disabled={!newGroup.trim()}
              onClick={() => {
                const g = newGroup.trim();
                if (g && !groups.includes(g)) setGroups([...groups, g]);
                setNewGroup('');
              }}
            >
              Adicionar
            </Button>
          </div>
          <span style={{ color: 'var(--color-text-secondary)' }}>O primeiro grupo marcado é o principal.</span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>Equipamento</strong>
          <input aria-label="Equipamento" list="library-equipment" style={input} value={equipment} maxLength={100} onChange={(e) => setEquipment(e.target.value)} />
          <datalist id="library-equipment">
            {equipmentOptions.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ExerciseRow({ exercise, onGif, onPreset, onEdit }: { exercise: ExerciseLibraryItem; onGif: () => void; onPreset: (s: SetsSuggestion) => void; onEdit: () => void }) {
  return (
    <li className={styles.row}>
      <span className={styles.avatar} aria-hidden="true">
        {initialsOf(exercise.name)}
      </span>
      <div className={styles.body}>
        <div className={styles.nameLine}>
          <span className={styles.name}>{exercise.name}</span>
          {exercise.gifUrl ? (
            <button type="button" className={styles.gifButton} onClick={onGif} aria-label={`Ver GIF de ${exercise.name}`}>
              GIF
            </button>
          ) : null}
        </div>
        <div className={styles.tags}>
          {exercise.muscleGroups.length > 0 ? (
            exercise.muscleGroups.map((g) => (
              <span key={g} className={styles.tag}>
                {g}
              </span>
            ))
          ) : (
            <span className={styles.noGroup}>Sem grupos definidos</span>
          )}
          {exercise.equipment ? <span className={styles.tag}>🏋 {exercise.equipment}</span> : null}
        </div>
        <div className={styles.tags}>
          {SETS_SUGGESTIONS.map((s) => (
            <button key={setsText(s)} type="button" className={styles.suggestion} onClick={() => onPreset(s)} title="Guardar como preset">
              {setsText(s)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.actions}>
        <Button size="small" variant="secondary" onClick={() => onPreset(SETS_SUGGESTIONS[0])}>
          + Preset
        </Button>
        {exercise.canEdit ? (
          <Button size="small" variant="ghost" onClick={onEdit}>
            Editar
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function PresetsList({ presets, loading, onDelete }: { presets: ExercisePreset[]; loading: boolean; onDelete: (p: ExercisePreset) => void }) {
  if (loading) return <EmptyState title="Carregando presets…" />;
  if (presets.length === 0)
    return <EmptyState title="Nenhum preset ainda" description='Na lista de exercícios, use "+ Preset" ou clique numa das sugestões de séries.' />;
  return (
    <ul className={styles.list}>
      {presets.map((p) => (
        <li key={p.id} className={styles.row}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(p.exercise.name)}
          </span>
          <div className={styles.body}>
            <span className={styles.name}>{p.exercise.name}</span>
            <div className={styles.tags}>
              <span className={styles.tag} style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                {setsText(p)}
              </span>
              {p.exercise.muscleGroups.map((g) => (
                <span key={g} className={styles.tag}>
                  {g}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <Button size="small" variant="ghost" onClick={() => onDelete(p)} aria-label={`Excluir preset de ${p.exercise.name}`}>
              Excluir
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tela "Exercícios": a biblioteca inteira (≈5 mil), com busca, filtros e paginação no servidor. */
export function ExerciseLibraryPage() {
  const queryClient = useQueryClient();
  const [tab, setTabState] = useState<'library' | 'presets' | 'without-gif'>('library');
  const [linkedGifs, setLinkedGifs] = useState<LinkedGifs>({});
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [allGroups, setAllGroups] = useState(false);
  const [gifOf, setGifOf] = useState<ExerciseLibraryItem | null>(null);
  const [presetFor, setPresetFor] = useState<{ exercise: ExerciseLibraryItem; initial: SetsSuggestion } | null>(null);
  const [editing, setEditing] = useState<ExerciseLibraryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());

  const library = useInfiniteQuery({
    queryKey: ['exercise-library', debounced, group, equipment],
    queryFn: ({ pageParam }) => api.listExerciseLibrary({ search: debounced, group, equipment, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const presets = useQuery({ queryKey: ['exercise-presets'], queryFn: api.listExercisePresets });
  const withoutGif = useQuery({ queryKey: ['exercises-without-gif'], queryFn: api.listExercisesWithoutGif });
  const withoutGifCount = pendingCount(withoutGif.data ?? [], linkedGifs);
  const setTab = (next: typeof tab) => {
    // Saindo da aba "Sem GIF": recarrega a lista (os resolvidos saem dela).
    if (tab === 'without-gif' && next !== 'without-gif' && Object.keys(linkedGifs).length > 0) {
      setLinkedGifs({});
      void queryClient.invalidateQueries({ queryKey: ['exercises-without-gif'] });
    }
    setTabState(next);
  };
  const first = library.data?.pages[0];
  const items = useMemo(() => library.data?.pages.flatMap((p) => p.items) ?? [], [library.data]);
  const total = first?.total ?? 0;
  const groups = first?.groups ?? [];
  const shownGroups = allGroups ? groups : groups.slice(0, MAIN_GROUPS);
  const groupOptions = groups.map((g) => g.name);
  const equipmentOptions = (first?.equipments ?? []).map((e) => e.name);

  // Rolagem infinita: ao chegar perto do fim, carrega a próxima página.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && library.hasNextPage && !library.isFetchingNextPage) void library.fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [library]);

  const removePreset = useMutation({
    mutationFn: (p: ExercisePreset) => api.deleteExercisePreset(p.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercise-presets'] }),
  });

  const chooseGroup = (value: string) => setGroup((current) => (current === value ? '' : value));

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Exercícios</h1>
          <p className={styles.subtitle}>Biblioteca com GIF de demonstração. Guarde séries prontas como preset e use nos treinos e modelos.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Criar Exercício</Button>
      </div>

      <div role="tablist" aria-label="Biblioteca" className={styles.tabs}>
        <button type="button" role="tab" aria-selected={tab === 'library'} className={[styles.tab, tab === 'library' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('library')}>
          Biblioteca
        </button>
        <button type="button" role="tab" aria-selected={tab === 'presets'} className={[styles.tab, tab === 'presets' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('presets')}>
          Meus presets ({presets.data?.length ?? 0})
        </button>
        {withoutGifCount > 0 || tab === 'without-gif' ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'without-gif'}
            className={[styles.tab, tab === 'without-gif' ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab('without-gif')}
          >
            Sem GIF ({withoutGifCount})
          </button>
        ) : null}
      </div>

      {notice ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          {notice}
        </div>
      ) : null}

      {tab === 'without-gif' ? (
        <WithoutGifTab items={withoutGif.data ?? []} loading={withoutGif.isLoading} linked={linkedGifs} setLinked={setLinkedGifs} />
      ) : tab === 'presets' ? (
        <PresetsList presets={presets.data ?? []} loading={presets.isLoading} onDelete={(p) => removePreset.mutate(p)} />
      ) : (
        <>
          <label className={styles.search}>
            <Icon name="search" size={18} />
            <input placeholder="Procurar..." aria-label="Procurar exercício" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>

          <div className={styles.filters} aria-label="Filtros">
            <button type="button" className={[styles.chip, group === '' ? styles.chipActive : ''].join(' ')} onClick={() => setGroup('')}>
              Todos
            </button>
            {shownGroups.map((g) => (
              <button key={g.name} type="button" aria-pressed={group === g.name} className={[styles.chip, group === g.name ? styles.chipActive : ''].join(' ')} onClick={() => chooseGroup(g.name)}>
                {g.name} ({g.count.toLocaleString('pt-BR')})
              </button>
            ))}
            {allGroups && (first?.withoutGroup ?? 0) > 0 ? (
              <button type="button" aria-pressed={group === NO_GROUP} className={[styles.chip, group === NO_GROUP ? styles.chipActive : ''].join(' ')} onClick={() => chooseGroup(NO_GROUP)}>
                Sem grupos definidos ({first!.withoutGroup.toLocaleString('pt-BR')})
              </button>
            ) : null}
            {groups.length > MAIN_GROUPS ? (
              <button type="button" className={styles.chip} onClick={() => setAllGroups((v) => !v)} aria-expanded={allGroups}>
                {allGroups ? 'Menos' : `+${groups.length - MAIN_GROUPS}`}
              </button>
            ) : null}
            <select className={styles.select} aria-label="Equipamento" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              <option value="">Todos os equipamentos</option>
              {(first?.equipments ?? []).map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name} ({e.count.toLocaleString('pt-BR')})
                </option>
              ))}
            </select>
            <span className={styles.total} aria-live="polite">
              {total.toLocaleString('pt-BR')} {total === 1 ? 'exercício' : 'exercícios'}
            </span>
          </div>

          {library.isLoading ? (
            <EmptyState title="Carregando exercícios…" />
          ) : items.length === 0 ? (
            <EmptyState title="Nenhum exercício encontrado" description="Tente outro nome ou tire um filtro." />
          ) : (
            <ul className={styles.list}>
              {items.map((exercise) => (
                <ExerciseRow
                  key={exercise.id}
                  exercise={exercise}
                  onGif={() => setGifOf(exercise)}
                  onPreset={(initial) => setPresetFor({ exercise, initial })}
                  onEdit={() => setEditing(exercise)}
                />
              ))}
            </ul>
          )}
          <div ref={sentinel} />
          {library.hasNextPage ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="ghost" onClick={() => library.fetchNextPage()} loading={library.isFetchingNextPage}>
                Carregar mais
              </Button>
            </div>
          ) : null}
        </>
      )}

      {gifOf ? (
        <Modal title={gifOf.name} onClose={() => setGifOf(null)}>
          <ExercisePreview exercise={{ name: gifOf.name, muscleGroup: gifOf.muscleGroups[0] ?? null, equipment: gifOf.equipment, imageUrl: gifOf.gifUrl }} />
        </Modal>
      ) : null}
      {presetFor ? (
        <PresetModal
          exercise={presetFor.exercise}
          initial={presetFor.initial}
          onClose={() => setPresetFor(null)}
          onSaved={() => {
            setNotice(`Preset salvo: ${presetFor.exercise.name}. Está em "Meus presets".`);
            setPresetFor(null);
            void queryClient.invalidateQueries({ queryKey: ['exercise-presets'] });
          }}
        />
      ) : null}
      {editing ? (
        <EditModal
          exercise={editing}
          groupOptions={groupOptions}
          equipmentOptions={equipmentOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice('Exercício atualizado.');
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
          }}
        />
      ) : null}
      {creating ? (
        <Modal title="Criar exercício" onClose={() => setCreating(false)}>
          <NewExerciseForm
            onCreated={(created) => {
              setCreating(false);
              setNotice(`"${created.name}" foi criado no seu catálogo particular.`);
              void queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}
