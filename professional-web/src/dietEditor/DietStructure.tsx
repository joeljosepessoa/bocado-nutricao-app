import { useState } from 'react';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import type { DietChoiceNode, DietDayNode, DietGroupNode, DietMealNode, MealFood, NutritionRange } from '../types/api';
import styles from './DietStructure.module.css';
import { useDraftEdit, type DraftEdit } from './draftEdit';
import { DayFormModal, FoodItemModal, LabelModal } from './StructureModals';
import {
  DAY_KIND_LABELS,
  GROUP_KIND_TEXT,
  dayTitle,
  foodCalcStatus,
  foodName,
  formatKcal,
  formatMacros,
  isRange,
  quantityText,
  reorderPatches,
  showDayTabs,
  type FoodItemValues,
} from './structure';

/**
 * Estrutura da dieta: DIA → REFEIÇÃO → GRUPO → ESCOLHA → ALIMENTOS.
 * Com `DraftEditContext` (rascunho) mostra os controles de edição; sem ele é
 * somente leitura (versão publicada). Toda nutrição exibida vem da API.
 */
export function DietDaysView({ days }: { days: DietDayNode[] }) {
  const edit = useDraftEdit();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState(false);
  const keyOf = (day: DietDayNode, i: number) => day.id ?? `dia-${i}`;
  const selectedIndex = Math.max(
    0,
    days.findIndex((d, i) => keyOf(d, i) === selectedKey),
  );
  const day = days[selectedIndex];
  const tabs = showDayTabs(days);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tabs || edit ? (
        <div className={styles.dayBar} role="tablist" aria-label="Dias da dieta">
          {tabs
            ? days.map((d, i) => (
                <button
                  key={keyOf(d, i)}
                  type="button"
                  role="tab"
                  aria-selected={i === selectedIndex}
                  className={[styles.dayTab, i === selectedIndex ? styles.dayTabActive : ''].join(' ')}
                  onClick={() => setSelectedKey(keyOf(d, i))}
                >
                  {dayTitle(d, i)}
                </button>
              ))
            : (
                <span className={styles.muted} style={{ padding: '0 8px' }}>
                  Dieta com um único dia — adicione tipos de dia se o plano mudar entre treino e descanso.
                </span>
              )}
          {edit ? (
            <Button size="small" variant="ghost" onClick={() => setAddingDay(true)} style={{ marginLeft: 'auto' }}>
              + Tipo de dia
            </Button>
          ) : null}
        </div>
      ) : null}

      {day ? <DayPanel key={keyOf(day, selectedIndex)} day={day} index={selectedIndex} days={days} showHeader={tabs} /> : <EmptyState title="Nenhuma refeição nesta dieta." />}

      {addingDay && edit ? (
        <DayFormModal
          title="Novo tipo de dia"
          onClose={() => setAddingDay(false)}
          onSubmit={async (values) => {
            let createdId: string | null = null;
            const ok = await edit.run(async () => {
              const created = (await api.createDietDay(edit.ref, values)) as { id: string };
              createdId = created.id;
            }, 'Não foi possível adicionar o dia.');
            if (ok && createdId) setSelectedKey(createdId);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

function NutritionSummary({ range, prefix }: { range: NutritionRange; prefix?: string }) {
  return (
    <div className={styles.nutrition}>
      <span className={styles.kcal}>
        {prefix ? `${prefix} ` : ''}
        {formatKcal(range)}
      </span>
      <span className={styles.macros}>{formatMacros(range)}</span>
      {range.partial ? <PartialBadge /> : null}
    </div>
  );
}

function PartialBadge() {
  return (
    <span className={[styles.badge, styles.partial].join(' ')} title="Algum item está à vontade, sem quantidade ou fora do catálogo e não entrou na soma.">
      Total parcial
    </span>
  );
}

function MoveButtons({ label, index, count, onMove, horizontal = false }: { label: string; index: number; count: number; onMove: (to: number) => void; horizontal?: boolean }) {
  if (count < 2) return null;
  return (
    <>
      <button type="button" className={styles.iconButton} aria-label={`Mover ${label} para ${horizontal ? 'a esquerda' : 'cima'}`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        {horizontal ? '←' : '↑'}
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={`Mover ${label} para ${horizontal ? 'a direita' : 'baixo'}`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        {horizontal ? '→' : '↓'}
      </button>
    </>
  );
}

/** Reordena renumerando os irmãos (uma chamada por item que mudou de posição). */
function reorder<T extends { id: string | null; order: number }>(
  edit: DraftEdit,
  items: T[],
  from: number,
  to: number,
  patch: (id: string, order: number) => Promise<unknown>,
) {
  const patches = reorderPatches(items, from, to);
  if (patches.length === 0) return;
  void edit.run(async () => {
    for (const p of patches) await patch(p.id, p.order);
  }, 'Não foi possível reordenar.');
}

function DayPanel({ day, index, days, showHeader }: { day: DietDayNode; index: number; days: DietDayNode[]; showHeader: boolean }) {
  const edit = useDraftEdit();
  const [editingDay, setEditingDay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMeal, setNewMeal] = useState('');
  const title = dayTitle(day, index);

  return (
    <section aria-label={showHeader ? title : 'Refeições'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showHeader ? (
        <Card>
          <div className={styles.dayHeader}>
            <div>
              <h3 className={styles.dayTitle}>{title}</h3>
              <div className={styles.muted}>
                {DAY_KIND_LABELS[day.kind]}
                {day.usageNotes ? ` · ${day.usageNotes}` : ''}
              </div>
            </div>
            <NutritionSummary range={day.nutrition} prefix={isRange(day.nutrition) ? 'Faixa do dia:' : 'Total do dia:'} />
          </div>
          {edit && day.id ? (
            <div className={styles.actions}>
              <MoveButtons
                label={title}
                index={index}
                count={days.length}
                horizontal
                onMove={(to) => reorder(edit, days, index, to, (id, order) => api.updateDietDay(edit.ref, id, { order }))}
              />
              <Button size="small" variant="ghost" onClick={() => setEditingDay(true)}>
                Editar dia
              </Button>
              <Button size="small" variant="ghost" disabled={day.meals.length > 0} onClick={() => setConfirmDelete(true)}>
                Excluir dia
              </Button>
              {day.meals.length > 0 ? <span className={styles.muted}>Para excluir o dia, remova antes as refeições dele.</span> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {day.meals.length === 0 ? <div className={styles.muted}>Nenhuma refeição neste dia ainda.</div> : null}
      {day.meals.map((meal, i) => (
        <MealCard key={meal.id} meal={meal} index={i} siblings={day.meals} />
      ))}

      {edit ? (
        <Card>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className={styles.field} style={{ flex: 1, minWidth: 200 }}>
              <span className={styles.fieldLabel}>Nova refeição{showHeader ? ` em ${title}` : ''}</span>
              <input className={styles.input} placeholder="Ex.: Café da manhã" value={newMeal} onChange={(e) => setNewMeal(e.target.value)} />
            </label>
            <Button
              onClick={() => {
                const name = newMeal.trim();
                if (!name) return;
                setNewMeal('');
                void edit.run(() => api.createMeal(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, { name, dietDayId: day.id ?? undefined }), 'Não foi possível adicionar a refeição.');
              }}
            >
              Adicionar refeição
            </Button>
          </div>
        </Card>
      ) : null}

      {editingDay && edit && day.id ? (
        <DayFormModal
          title="Editar dia"
          initial={{ label: day.label ?? title, kind: day.kind, usageNotes: day.usageNotes ?? '' }}
          onClose={() => setEditingDay(false)}
          onSubmit={(values) => edit.run(() => api.updateDietDay(edit.ref, day.id!, values), 'Não foi possível salvar o dia.')}
        />
      ) : null}
      {confirmDelete && edit && day.id ? (
        <ConfirmDialog
          title="Excluir este dia?"
          description={`"${title}" sai deste rascunho. A versão publicada não é alterada.`}
          confirmLabel="Excluir dia"
          danger
          onConfirm={() => edit.run(() => api.deleteDietDay(edit.ref, day.id!), 'Não foi possível excluir o dia.')}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </section>
  );
}

function MealCard({ meal, index, siblings }: { meal: DietMealNode; index: number; siblings: DietMealNode[] }) {
  const edit = useDraftEdit();
  const [name, setName] = useState(meal.name);
  const [time, setTime] = useState(meal.time ?? '');
  const [notes, setNotes] = useState(meal.notes ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newBlock, setNewBlock] = useState(false);

  const hasOptions = meal.groups.some((g) => g.kind === 'meal_options');
  const hasFixed = meal.groups.some((g) => g.kind === 'fixed');
  const hasFoods = meal.groups.some((g) => g.choices.some((c) => c.foods.length > 0));
  const editableGroups = meal.groups.filter((g) => g.id);

  const updateMeal = (input: { name?: string; time?: string; notes?: string }) =>
    edit && edit.run(() => api.updateMeal(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, meal.id, input), 'Não foi possível salvar a refeição.');

  return (
    <section aria-label={`Refeição ${meal.name}`}>
      <Card>
        <div className={styles.mealHeader}>
          {edit ? (
            <>
              <label className={styles.field} style={{ flex: 2, minWidth: 180 }}>
                <span className={styles.fieldLabel}>Refeição</span>
                <input
                  className={styles.input}
                  aria-label="Nome da refeição"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && name.trim() !== meal.name && updateMeal({ name: name.trim() })}
                />
              </label>
              <label className={styles.field} style={{ width: 120 }}>
                <span className={styles.fieldLabel}>Horário</span>
                <input
                  type="time"
                  className={styles.input}
                  aria-label="Horário da refeição"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  onBlur={() => time && time !== (meal.time ?? '') && updateMeal({ time })}
                />
              </label>
            </>
          ) : (
            <div>
              <div className={styles.mealName}>{meal.name}</div>
              {meal.time ? <div className={styles.muted}>{meal.time}</div> : null}
            </div>
          )}
          <NutritionSummary range={meal.nutrition} />
        </div>

        {edit ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Observações da refeição</span>
            <input
              className={styles.input}
              aria-label="Observações da refeição"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (meal.notes ?? '') && updateMeal({ notes })}
            />
          </label>
        ) : meal.notes ? (
          <div className={styles.muted}>{meal.notes}</div>
        ) : null}

        {meal.groups.length === 0 ? <div className={styles.muted}>Nenhum alimento ainda.</div> : null}
        {meal.groups.map((group) => (
          <GroupSection
            key={group.id ?? 'grupo-antigo'}
            meal={meal}
            group={group}
            index={editableGroups.indexOf(group)}
            groups={editableGroups}
            compact={meal.groups.length === 1 && group.kind === 'fixed'}
          />
        ))}

        {edit ? (
          <div className={styles.actions} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
            <MoveButtons
              label={meal.name}
              index={index}
              count={siblings.length}
              onMove={(to) => reorder(edit, siblings, index, to, (id, order) => api.updateMeal(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, id, { order }))}
            />
            {!hasOptions ? (
              <>
                {!hasFixed ? (
                  <Button size="small" variant="ghost" onClick={() => void edit.run(() => api.createMealGroup(edit.ref, meal.id, { kind: 'fixed' }), 'Não foi possível adicionar os itens fixos.')}>
                    + Itens fixos
                  </Button>
                ) : null}
                <Button size="small" variant="ghost" onClick={() => setNewBlock(true)}>
                  + Bloco &quot;escolha 1&quot;
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={hasFoods}
                  title={hasFoods ? 'Opções completas só podem ser criadas em uma refeição ainda sem alimentos.' : undefined}
                  onClick={() =>
                    void edit.run(async () => {
                      const group = (await api.createMealGroup(edit.ref, meal.id, { kind: 'meal_options' })) as { id: string };
                      await api.createMealChoice(edit.ref, meal.id, group.id, { label: 'Opção 1' });
                    }, 'Não foi possível criar as opções completas.')
                  }
                >
                  Usar opções completas
                </Button>
              </>
            ) : null}
            <Button size="small" variant="ghost" onClick={() => setConfirmRemove(true)} style={{ marginLeft: 'auto' }}>
              Remover refeição
            </Button>
          </div>
        ) : null}
      </Card>

      {newBlock && edit ? (
        <LabelModal
          title='Novo bloco "escolha 1"'
          fieldLabel="Nome do bloco"
          required
          onClose={() => setNewBlock(false)}
          onSubmit={(label) => edit.run(() => api.createMealGroup(edit.ref, meal.id, { kind: 'alternatives', label }), 'Não foi possível adicionar o bloco.')}
        />
      ) : null}
      {confirmRemove && edit ? (
        <ConfirmDialog
          title="Remover esta refeição?"
          description={`"${meal.name}" e os alimentos dela saem deste rascunho. A versão publicada não é alterada.`}
          confirmLabel="Remover refeição"
          danger
          onConfirm={() => edit.run(() => api.deleteMeal(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, meal.id), 'Não foi possível remover a refeição.')}
          onClose={() => setConfirmRemove(false)}
        />
      ) : null}
    </section>
  );
}

function toChoiceInput(v: FoodItemValues): api.ChoiceFoodInput {
  return {
    foodId: v.foodId,
    customFoodName: v.customFoodName,
    isFreeQuantity: v.isFreeQuantity || undefined,
    quantity: v.quantity,
    quantityMax: v.quantityMax ?? undefined,
    unit: v.unit as api.ChoiceFoodInput['unit'],
    notes: v.notes,
  };
}

/** Item novo numa escolha. Dado antigo sem escolha cai no endpoint antigo (grupo fixo, só catálogo). */
function addFood(edit: DraftEdit, mealId: string, group: DietGroupNode, choice: DietChoiceNode, v: FoodItemValues) {
  const fallback = 'Não foi possível adicionar o alimento.';
  if (group.id && choice.id) return edit.run(() => api.addChoiceFood(edit.ref, mealId, group.id!, choice.id!, toChoiceInput(v)), fallback);
  return edit.run(
    () => api.addMealFood(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, mealId, { foodId: v.foodId!, quantity: v.quantity!, unit: v.unit! }),
    fallback,
  );
}

type GroupModal =
  | { type: 'add-food'; choice: DietChoiceNode }
  | { type: 'add-alternative' }
  | { type: 'rename-group' }
  | { type: 'rename-choice'; choice: DietChoiceNode }
  | { type: 'delete-group' }
  | { type: 'delete-choice'; choice: DietChoiceNode; title: string };

function GroupSection({ meal, group, index, groups, compact }: { meal: DietMealNode; group: DietGroupNode; index: number; groups: DietGroupNode[]; compact: boolean }) {
  const edit = useDraftEdit();
  const [modal, setModal] = useState<GroupModal | null>(null);
  const text = GROUP_KIND_TEXT[group.kind];
  const title = group.kind === 'alternatives' ? (group.label ?? text.title) : group.label ? `${text.title} · ${group.label}` : text.title;
  const canEdit = !!edit && !!group.id;
  const close = () => setModal(null);
  const choiceTitle = (choice: DietChoiceNode, i: number) => choice.label ?? `Opção ${i + 1}`;
  const reorderChoice = (from: number, to: number) =>
    edit && reorder(edit, group.choices, from, to, (id, order) => api.updateMealChoice(edit.ref, meal.id, group.id!, id, { order }));

  const totalText =
    group.kind === 'fixed'
      ? `${group.nutrition.partial ? 'Total parcial' : 'Total'}: ${formatKcal(group.nutrition)}`
      : `Faixa: ${formatKcal(group.nutrition)}`;

  return (
    <section aria-label={title} className={compact ? undefined : [styles.group, styles[`group_${group.kind}`]].join(' ')} style={compact ? { display: 'flex', flexDirection: 'column', gap: 6 } : undefined}>
      <div className={styles.groupHeader}>
        {compact ? (
          <span className={styles.muted}>Itens fixos · consumir todos</span>
        ) : (
          <>
            <span className={styles.groupTitle}>{title}</span>
            <span className={[styles.badge, styles[`badge_${group.kind}`]].join(' ')}>{text.instruction}</span>
            <span className={styles.foodMeta} style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--color-text)' }}>
              {totalText}
            </span>
            {group.kind !== 'fixed' && group.nutrition.partial ? <PartialBadge /> : null}
          </>
        )}
      </div>

      {group.kind === 'fixed' ? (
        <FixedChoice meal={meal} group={group} onAddFood={(choice) => setModal({ type: 'add-food', choice })} />
      ) : group.kind === 'meal_options' ? (
        <div className={styles.optionGrid}>
          {group.choices.map((choice, i) => (
            <article key={choice.id ?? i} aria-label={choiceTitle(choice, i)} className={styles.optionCard}>
              <div className={styles.optionTitle}>{choiceTitle(choice, i)}</div>
              <FoodList mealId={meal.id} foods={choice.foods} />
              <div className={styles.optionFooter}>
                <span className={styles.kcal}>{formatKcal(choice.nutrition)}</span>
                {choice.nutrition.partial ? <PartialBadge /> : null}
              </div>
              {canEdit && choice.id ? (
                <div className={styles.actions}>
                  <MoveButtons label={choiceTitle(choice, i)} index={i} count={group.choices.length} horizontal onMove={(to) => reorderChoice(i, to)} />
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'add-food', choice })}>
                    + Alimento
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'rename-choice', choice })}>
                    Renomear
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'delete-choice', choice, title: choiceTitle(choice, i) })}>
                    Excluir opção
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
          {group.choices.length === 0 ? <div className={styles.muted}>Nenhuma opção ainda.</div> : null}
        </div>
      ) : (
        <div>
          {group.choices.length === 0 ? <div className={styles.muted}>Nenhuma alternativa ainda.</div> : null}
          {group.choices.map((choice, i) => (
            <div key={choice.id ?? i} className={styles.alternative} role="group" aria-label={`Alternativa ${i + 1}`}>
              <span className={styles.radio} aria-hidden />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {choice.foods.length > 1 || choice.label ? <span style={{ fontSize: 12.5, fontWeight: 700 }}>{choiceTitle(choice, i)}</span> : null}
                <FoodList mealId={meal.id} foods={choice.foods} />
                {choice.foods.length > 1 ? (
                  <span className={styles.foodMeta}>
                    {formatKcal(choice.nutrition)}
                    {choice.nutrition.partial ? ' (parcial)' : ''}
                  </span>
                ) : null}
              </div>
              {canEdit && choice.id ? (
                <div className={styles.actions}>
                  <MoveButtons label={`alternativa ${i + 1}`} index={i} count={group.choices.length} onMove={(to) => reorderChoice(i, to)} />
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'add-food', choice })}>
                    + Alimento
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'rename-choice', choice })}>
                    Renomear
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setModal({ type: 'delete-choice', choice, title: `alternativa ${i + 1}` })}>
                    Excluir alternativa
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canEdit && !compact ? (
        <div className={styles.actions}>
          {group.kind !== 'meal_options' ? <MoveButtons label={`bloco ${title}`} index={index} count={groups.length} onMove={(to) => edit && reorder(edit, groups, index, to, (id, order) => api.updateMealGroup(edit.ref, meal.id, id, { order }))} /> : null}
          {group.kind === 'meal_options' ? (
            <Button
              size="small"
              variant="secondary"
              onClick={() => void edit!.run(() => api.createMealChoice(edit!.ref, meal.id, group.id!, { label: `Opção ${group.choices.length + 1}` }), 'Não foi possível adicionar a opção.')}
            >
              + Opção
            </Button>
          ) : null}
          {group.kind === 'alternatives' ? (
            <>
              <Button size="small" variant="secondary" onClick={() => setModal({ type: 'add-alternative' })}>
                + Alternativa
              </Button>
              <Button size="small" variant="ghost" onClick={() => setModal({ type: 'rename-group' })}>
                Renomear bloco
              </Button>
            </>
          ) : null}
          <Button size="small" variant="ghost" onClick={() => setModal({ type: 'delete-group' })} style={{ marginLeft: 'auto' }}>
            {group.kind === 'meal_options' ? 'Remover opções completas' : group.kind === 'fixed' ? 'Remover itens fixos' : 'Remover bloco'}
          </Button>
        </div>
      ) : null}

      {edit && modal?.type === 'add-food' ? (
        <FoodItemModal
          title="Adicionar alimento"
          catalogOnly={!group.id || !modal.choice.id}
          onClose={close}
          onSubmit={(v) => addFood(edit, meal.id, group, modal.choice, v)}
        />
      ) : null}
      {edit && group.id && modal?.type === 'add-alternative' ? (
        <FoodItemModal
          title={`Nova alternativa em ${title}`}
          onClose={close}
          onSubmit={(v) =>
            edit.run(async () => {
              const choice = await api.createMealChoice(edit.ref, meal.id, group.id!, {});
              try {
                await api.addChoiceFood(edit.ref, meal.id, group.id!, choice.id, toChoiceInput(v));
              } catch (err) {
                // Não deixa alternativa vazia para trás se o item foi recusado.
                await api.deleteMealChoice(edit.ref, meal.id, group.id!, choice.id).catch(() => undefined);
                throw err;
              }
            }, 'Não foi possível adicionar a alternativa.')
          }
        />
      ) : null}
      {edit && group.id && modal?.type === 'rename-group' ? (
        <LabelModal
          title="Renomear bloco"
          fieldLabel="Nome do bloco"
          initial={group.label ?? ''}
          required
          onClose={close}
          onSubmit={(label) => edit.run(() => api.updateMealGroup(edit.ref, meal.id, group.id!, { label }), 'Não foi possível renomear o bloco.')}
        />
      ) : null}
      {edit && group.id && modal?.type === 'rename-choice' && modal.choice.id ? (
        <LabelModal
          title="Renomear"
          fieldLabel="Nome"
          initial={modal.choice.label ?? ''}
          onClose={close}
          onSubmit={(label) => edit.run(() => api.updateMealChoice(edit.ref, meal.id, group.id!, modal.choice.id!, { label }), 'Não foi possível renomear.')}
        />
      ) : null}
      {edit && group.id && modal?.type === 'delete-group' ? (
        <ConfirmDialog
          title="Remover este grupo?"
          description={`"${title}" e os alimentos dele saem desta refeição no rascunho.`}
          confirmLabel="Remover"
          danger
          onConfirm={() => edit.run(() => api.deleteMealGroup(edit.ref, meal.id, group.id!), 'Não foi possível remover o grupo.')}
          onClose={close}
        />
      ) : null}
      {edit && group.id && modal?.type === 'delete-choice' && modal.choice.id ? (
        <ConfirmDialog
          title={`Excluir ${modal.title}?`}
          description="Os alimentos desta escolha também saem do rascunho."
          confirmLabel="Excluir"
          danger
          onConfirm={() => edit.run(() => api.deleteMealChoice(edit.ref, meal.id, group.id!, modal.choice.id!), 'Não foi possível excluir.')}
          onClose={close}
        />
      ) : null}
    </section>
  );
}

function FixedChoice({ meal, group, onAddFood }: { meal: DietMealNode; group: DietGroupNode; onAddFood: (choice: DietChoiceNode) => void }) {
  const edit = useDraftEdit();
  const choice = group.choices[0];
  if (!choice) return <div className={styles.muted}>Nenhum alimento ainda.</div>;
  return (
    <>
      {choice.foods.length === 0 ? <div className={styles.muted}>Nenhum alimento ainda.</div> : <FoodList mealId={meal.id} foods={choice.foods} />}
      {edit ? (
        <div>
          <Button size="small" variant="ghost" onClick={() => onAddFood(choice)}>
            + Alimento
          </Button>
        </div>
      ) : null}
    </>
  );
}

function FoodList({ mealId, foods }: { mealId: string; foods: MealFood[] }) {
  if (foods.length === 0) return <div className={styles.muted}>Sem alimentos.</div>;
  return (
    <div>
      {foods.map((food) => (
        <FoodLine key={food.id} mealId={mealId} food={food} />
      ))}
    </div>
  );
}

function FoodLine({ mealId, food }: { mealId: string; food: MealFood }) {
  const edit = useDraftEdit();
  const [editing, setEditing] = useState(false);
  const name = foodName(food);
  const qty = quantityText(food);
  const status = foodCalcStatus(food);

  return (
    <div className={styles.foodLine}>
      <span className={styles.foodText}>
        {qty ? <span className={styles.foodQty}>{qty} </span> : null}
        {name}
        {food.notes ? <span className={styles.muted}> · {food.notes}</span> : null}
        {edit && food.customFoodName && food.food ? (
          <span className={styles.muted} title="Usado só para calcular kcal e macros — o paciente vê o nome escrito.">
            {' '}
            · catálogo: {food.food.name}
          </span>
        ) : null}
      </span>
      {status ? (
        <span className={styles.noCalc}>{status}</span>
      ) : (
        <span className={styles.foodMeta}>
          {food.quantityMax != null ? 'a partir de ' : ''}
          {Math.round(food.kcal!)} kcal
        </span>
      )}
      {edit ? (
        <span className={styles.actions}>
          <Button size="small" variant="ghost" aria-label={`Editar ${name}`} onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            size="small"
            variant="ghost"
            aria-label={`Remover ${name}`}
            onClick={() => void edit.run(() => api.deleteMealFood(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, mealId, food.id), 'Não foi possível remover o alimento.')}
          >
            Remover
          </Button>
        </span>
      ) : null}
      {editing && edit ? (
        <FoodItemModal
          title={`Editar ${name}`}
          food={food}
          onClose={() => setEditing(false)}
          onSubmit={(v) =>
            edit.run(
              () =>
                api.updateMealFood(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, mealId, food.id, {
                  isFreeQuantity: v.isFreeQuantity,
                  ...(v.isFreeQuantity ? {} : { quantity: v.quantity, quantityMax: v.quantityMax ?? null, unit: v.unit }),
                  ...((v.notes ?? '') !== (food.notes ?? '') ? { notes: v.notes ?? '' } : {}),
                }),
              'Não foi possível salvar o alimento.',
            )
          }
        />
      ) : null}
    </div>
  );
}
