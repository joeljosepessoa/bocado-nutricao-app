import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import lib from '../exercises/ExerciseLibrary.module.css';
import type { FoodDetails, FoodLibraryItem } from '../types/api';
import { FoodDetailsModal } from './FoodDetailsModal';
import { FoodFormModal } from './FoodFormModal';
import styles from './Foods.module.css';
import { macroText, ORIGIN_LABELS } from './foodFormat';

const PAGE_SIZE = 40;
const NO_GROUP = '__sem_grupo__';
type Origin = 'all' | 'taco' | 'mine' | 'shared';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function FoodRow({ food, onOpen }: { food: FoodLibraryItem; onOpen: () => void }) {
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Abrir ${food.name}`}
    >
      <td>
        <div className={styles.foodName}>{food.name}</div>
        <div className={styles.foodMeta}>
          <span className={[styles.origin, styles[`origin_${food.origin}`]].join(' ')}>
            {food.origin === 'taco' && food.tacoNumber != null ? `TACO nº ${food.tacoNumber}` : ORIGIN_LABELS[food.origin]}
          </span>
          {food.foodGroup ? <span>{food.foodGroup}</span> : null}
          {food.householdMeasures > 0 ? <span>· medidas caseiras</span> : null}
          {food.pending ? <span className={styles.pending}>· aguardando aprovação</span> : null}
        </div>
      </td>
      <td>{macroText(food.kcalPer100, 'kcal')}</td>
      <td>{macroText(food.proteinGPer100, 'g')}</td>
      <td>{macroText(food.carbGPer100, 'g')}</td>
      <td>{macroText(food.fatGPer100, 'g')}</td>
      <td className={styles.dim}>{macroText(food.fiberGPer100, 'g')}</td>
    </tr>
  );
}

/** Tela "Alimentos": a TACO inteira e os alimentos que o profissional cadastra, com a ficha completa de cada um. */
export function FoodLibraryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [origin, setOrigin] = useState<Origin>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing?: FoodDetails; from?: FoodDetails } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());

  const library = useInfiniteQuery({
    queryKey: ['food-library', debounced, group, origin],
    queryFn: ({ pageParam }) => api.listFoodLibrary({ search: debounced, group, origin, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const first = library.data?.pages[0];
  const items = useMemo(() => library.data?.pages.flatMap((p) => p.items) ?? [], [library.data]);
  const origins = first?.origins;

  const refresh = (foodId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['food-library'] });
    void queryClient.invalidateQueries({ queryKey: ['foods'] });
    if (foodId) void queryClient.invalidateQueries({ queryKey: ['food-details', foodId] });
  };

  const originTab = (value: Origin, text: string, count: number | undefined) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={origin === value}
      className={[lib.tab, origin === value ? lib.tabActive : ''].join(' ')}
      onClick={() => {
        setOrigin(value);
        setGroup('');
      }}
    >
      {text}
      {count != null ? ` (${count.toLocaleString('pt-BR')})` : ''}
    </button>
  );

  return (
    <>
      <div className={lib.header}>
        <div>
          <h1 className={lib.title}>Alimentos</h1>
          <p className={lib.subtitle}>Tabela TACO (4ª edição) e os alimentos que você cadastrar. Valores por 100 g ou 100 ml — clique para ver a ficha completa.</p>
        </div>
        <Button onClick={() => setForm({})}>Cadastrar alimento</Button>
      </div>

      <div role="tablist" aria-label="Origem" className={lib.tabs} style={{ flexWrap: 'wrap', maxWidth: '100%' }}>
        {originTab('all', 'Todos', origins?.all)}
        {originTab('taco', 'TACO', origins?.taco)}
        {originTab('mine', 'Meus alimentos', origins?.mine)}
        {(origins?.shared ?? 0) > 0 || origin === 'shared' ? originTab('shared', 'De outros profissionais', origins?.shared) : null}
      </div>

      {notice ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          {notice}
        </div>
      ) : null}

      <label className={lib.search}>
        <Icon name="search" size={18} />
        <input placeholder="Procurar… (ex.: frango grelhado, feijao)" aria-label="Procurar alimento" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {(first?.groups.length ?? 0) > 1 || group ? (
        <div className={lib.filters} aria-label="Grupos">
          <button type="button" className={[lib.chip, group === '' ? lib.chipActive : ''].join(' ')} onClick={() => setGroup('')}>
            Todos os grupos
          </button>
          {(first?.groups ?? []).map((g) => (
            <button key={g.name} type="button" aria-pressed={group === g.name} className={[lib.chip, group === g.name ? lib.chipActive : ''].join(' ')} onClick={() => setGroup(group === g.name ? '' : g.name)}>
              {g.name} ({g.count})
            </button>
          ))}
          {(first?.withoutGroup ?? 0) > 0 ? (
            <button type="button" aria-pressed={group === NO_GROUP} className={[lib.chip, group === NO_GROUP ? lib.chipActive : ''].join(' ')} onClick={() => setGroup(group === NO_GROUP ? '' : NO_GROUP)}>
              Sem grupo ({first!.withoutGroup})
            </button>
          ) : null}
        </div>
      ) : null}

      {library.isLoading ? (
        <EmptyState title="Carregando alimentos…" />
      ) : library.isError ? (
        <EmptyState title="Não foi possível carregar os alimentos" description="Tente atualizar a página." />
      ) : items.length === 0 ? (
        <EmptyState
          title={origin === 'mine' && !debounced ? 'Você ainda não cadastrou alimentos' : 'Nenhum alimento encontrado'}
          description={
            origin === 'mine' && !debounced
              ? 'Use "Cadastrar alimento" para receitas, marcas ou o que não estiver na TACO. Só você vê.'
              : 'Tente outra palavra ou cadastre o alimento.'
          }
        />
      ) : (
        <>
          <div className={lib.filters}>
            <span className={lib.total}>
              {(first?.total ?? 0).toLocaleString('pt-BR')} {first?.total === 1 ? 'alimento' : 'alimentos'}
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Alimento</th>
                  <th scope="col">kcal</th>
                  <th scope="col">Proteína (g)</th>
                  <th scope="col">Carbo (g)</th>
                  <th scope="col">Gordura (g)</th>
                  <th scope="col">Fibra (g)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((food) => (
                  <FoodRow key={food.id} food={food} onOpen={() => setOpenId(food.id)} />
                ))}
              </tbody>
            </table>
          </div>
          {library.hasNextPage ? (
            <div className={styles.loadMore}>
              <Button variant="secondary" onClick={() => void library.fetchNextPage()} loading={library.isFetchingNextPage}>
                Mostrar mais
              </Button>
            </div>
          ) : null}
        </>
      )}

      {openId && !form ? (
        <FoodDetailsModal
          foodId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(food) => setForm({ editing: food })}
          onDuplicate={(food) => setForm({ from: food })}
          onDeleted={() => {
            setOpenId(null);
            setNotice('Alimento excluído.');
            refresh();
          }}
        />
      ) : null}

      {form ? (
        <FoodFormModal
          editing={form.editing}
          from={form.from}
          onClose={() => setForm(null)}
          onSaved={(food) => {
            setForm(null);
            setNotice(form.editing ? 'Alimento atualizado.' : `“${food.name}” cadastrado em Meus alimentos.`);
            refresh(food.id);
            setOpenId(food.id);
          }}
        />
      ) : null}
    </>
  );
}
