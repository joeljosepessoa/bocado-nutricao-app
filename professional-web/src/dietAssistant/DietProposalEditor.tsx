import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import styles from '../dietEditor/DietStructure.module.css';
import { DAY_KIND_LABELS, GROUP_KIND_TEXT } from '../dietEditor/structure';
import type { DietDayKind, NutritionUnit } from '../types/api';
import {
  choiceWarnings,
  emptyChoice,
  emptyGroup,
  emptyMeal,
  emptySupplement,
  foodDisplayName,
  foodWarnings,
  groupWarnings,
  manualFood,
  mealWarnings,
  moveMeal,
  removeChoice,
  removeFood,
  removeGroup,
  removeMeal,
  removeSupplement,
  selectFood,
  updateChoice,
  updateDay,
  updateFood,
  updateGroup,
  updateMeal,
  updateSupplement,
  asCustomName,
  UNIT_LABELS,
  UNITS,
  withoutNotice,
  type DietDraft,
  type DraftChoice,
  type DraftFood,
  type DraftGroup,
  type DraftMeal,
} from './draft';
import { FoodPickerModal } from './FoodPickerModal';

type Change = (draft: DietDraft) => void;

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));

function Warnings({ live, notices, onDismiss }: { live: string[]; notices: string[]; onDismiss: (notice: string) => void }) {
  if (live.length === 0 && notices.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {live.map((w) => (
        <div key={w} style={{ fontSize: 12, color: 'var(--color-danger)' }}>
          ⚠ {w}
        </div>
      ))}
      {notices.map((n) => (
        <div key={n} style={{ fontSize: 12, color: '#a2650f', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>⚠ {n}</span>
          <button type="button" onClick={() => onDismiss(n)} style={{ fontSize: 11.5, border: 0, background: 'none', color: 'var(--color-primary-dark)', cursor: 'pointer' }}>
            Marcar como revisado
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Revisão da proposta da IA na MESMA árvore da dieta (dia → refeição → bloco
 * → opção → alimento). Nada é gravado aqui — só edita o rascunho em memória.
 */
export function DietProposalEditor({ draft, onChange }: { draft: DietDraft; onChange: Change }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [picker, setPicker] = useState<{ choiceKey: string; foodKey: string | null; search: string } | null>(null);
  const dayIndex = Math.min(selectedDay, draft.days.length - 1);
  const day = draft.days[dayIndex];
  const tabs = draft.days.length > 1 || draft.days.some((d) => d.label.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {draft.notices.length > 0 ? (
        <Card title="Revise antes de criar">
          <Warnings live={[]} notices={draft.notices} onDismiss={(n) => onChange({ ...draft, notices: withoutNotice(draft.notices, n) })} />
        </Card>
      ) : null}

      {tabs ? (
        <div className={styles.dayBar} role="tablist" aria-label="Dias da dieta">
          {draft.days.map((d, i) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={i === dayIndex}
              className={[styles.dayTab, i === dayIndex ? styles.dayTabActive : ''].join(' ')}
              onClick={() => setSelectedDay(i)}
            >
              {d.label.trim() || `Dia ${i + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      {day ? (
        <section aria-label={tabs ? day.label.trim() || `Dia ${dayIndex + 1}` : 'Refeições'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tabs ? (
            <Card>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label className={styles.field} style={{ flex: 1, minWidth: 180 }}>
                  <span className={styles.fieldLabel}>Nome do dia</span>
                  <input className={styles.input} aria-label="Nome do dia" value={day.label} onChange={(e) => onChange(updateDay(draft, day.key, (x) => ({ ...x, label: e.target.value })))} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Tipo</span>
                  <select
                    className={styles.input}
                    aria-label="Tipo do dia"
                    value={day.kind}
                    onChange={(e) => onChange(updateDay(draft, day.key, (x) => ({ ...x, kind: e.target.value as DietDayKind })))}
                  >
                    {(Object.keys(DAY_KIND_LABELS) as DietDayKind[]).map((k) => (
                      <option key={k} value={k}>
                        {DAY_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Quando usar</span>
                <input
                  className={styles.input}
                  aria-label="Quando usar"
                  value={day.usageNotes}
                  onChange={(e) => onChange(updateDay(draft, day.key, (x) => ({ ...x, usageNotes: e.target.value })))}
                />
              </label>
              <Warnings live={[]} notices={day.notices} onDismiss={(n) => onChange(updateDay(draft, day.key, (x) => ({ ...x, notices: withoutNotice(x.notices, n) })))} />
            </Card>
          ) : null}

          {day.meals.map((meal, m) => (
            <MealReview
              key={meal.key}
              draft={draft}
              meal={meal}
              index={m}
              count={day.meals.length}
              onChange={onChange}
              onPick={(choiceKey, foodKey, search) => setPicker({ choiceKey, foodKey, search })}
            />
          ))}

          <div>
            <Button variant="secondary" onClick={() => onChange(updateDay(draft, day.key, (x) => ({ ...x, meals: [...x.meals, emptyMeal()] })))}>
              + Refeição
            </Button>
          </div>
        </section>
      ) : null}

      <SupplementsReview draft={draft} onChange={onChange} />

      <section aria-label="Orientações ao paciente">
        <Card title="Orientações ao paciente">
          <textarea
            className={styles.input}
            aria-label="Orientações ao paciente"
            rows={6}
            style={{ resize: 'vertical' }}
            value={draft.guidelines}
            onChange={(e) => onChange({ ...draft, guidelines: e.target.value })}
          />
          <span className={styles.muted}>Copiadas literalmente do texto. O paciente vê este texto depois que a dieta for publicada.</span>
        </Card>
      </section>

      {picker ? (
        <FoodPickerModal
          initialSearch={picker.search}
          onClose={() => setPicker(null)}
          onSelect={(chosen) => {
            if (picker.foodKey) onChange(updateFood(draft, picker.foodKey, (food) => selectFood(food, chosen)));
            else onChange(updateChoice(draft, picker.choiceKey, (choice) => ({ ...choice, foods: [...choice.foods, manualFood(chosen)] })));
          }}
        />
      ) : null}
    </div>
  );
}

type PickFood = (choiceKey: string, foodKey: string | null, search: string) => void;

function MealReview({ draft, meal, index, count, onChange, onPick }: { draft: DietDraft; meal: DraftMeal; index: number; count: number; onChange: Change; onPick: PickFood }) {
  const n = index + 1;
  const hasOptions = meal.groups.some((g) => g.kind === 'meal_options');
  const hasFixed = meal.groups.some((g) => g.kind === 'fixed');
  return (
    <section aria-label={`Refeição ${meal.name || n}`}>
      <Card>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className={styles.field} style={{ flex: 2, minWidth: 180 }}>
            <span className={styles.fieldLabel}>Refeição</span>
            <input aria-label={`Nome da refeição ${n}`} className={styles.input} value={meal.name} onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, name: e.target.value })))} />
          </label>
          <label className={styles.field} style={{ width: 120 }}>
            <span className={styles.fieldLabel}>Horário</span>
            <input
              type="time"
              aria-label={`Horário da refeição ${n}`}
              className={styles.input}
              value={meal.time}
              onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, time: e.target.value })))}
            />
          </label>
          <div className={styles.actions}>
            <Button size="small" variant="ghost" onClick={() => onChange(moveMeal(draft, meal.key, -1))} disabled={index === 0} aria-label="Mover refeição para cima">
              ↑
            </Button>
            <Button size="small" variant="ghost" onClick={() => onChange(moveMeal(draft, meal.key, 1))} disabled={index === count - 1} aria-label="Mover refeição para baixo">
              ↓
            </Button>
            <Button size="small" variant="ghost" onClick={() => onChange(removeMeal(draft, meal.key))}>
              Remover refeição
            </Button>
          </div>
        </div>
        <input
          aria-label={`Observações da refeição ${n}`}
          placeholder="Observações da refeição (opcional)"
          className={styles.input}
          value={meal.notes}
          onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, notes: e.target.value })))}
        />
        <Warnings live={mealWarnings(meal)} notices={meal.notices} onDismiss={(w) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, notices: withoutNotice(x.notices, w) })))} />

        {meal.groups.map((group) => (
          <GroupReview key={group.key} draft={draft} group={group} onChange={onChange} onPick={onPick} />
        ))}

        {!hasOptions ? (
          <div className={styles.actions}>
            {!hasFixed ? (
              <Button size="small" variant="ghost" onClick={() => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, groups: [...x.groups, emptyGroup('fixed')] })))}>
                + Itens fixos
              </Button>
            ) : null}
            <Button size="small" variant="ghost" onClick={() => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, groups: [...x.groups, emptyGroup('alternatives')] })))}>
              + Bloco &quot;escolha 1&quot;
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function GroupReview({ draft, group, onChange, onPick }: { draft: DietDraft; group: DraftGroup; onChange: Change; onPick: PickFood }) {
  const text = GROUP_KIND_TEXT[group.kind];
  const title = group.kind === 'alternatives' ? group.label.trim() || text.title : text.title;
  const removeLabel = group.kind === 'meal_options' ? 'Remover opções' : group.kind === 'fixed' ? 'Remover itens fixos' : 'Remover bloco';
  const choiceTitle = (choice: DraftChoice, i: number) => choice.label.trim() || `Opção ${i + 1}`;

  const choiceActions = (choice: DraftChoice, removeText: string) => (
    <div className={styles.actions}>
      <Button size="small" variant="ghost" onClick={() => onPick(choice.key, null, '')}>
        + Alimento
      </Button>
      <Button size="small" variant="ghost" onClick={() => onChange(removeChoice(draft, choice.key))}>
        {removeText}
      </Button>
    </div>
  );

  return (
    <section aria-label={title} className={[styles.group, styles[`group_${group.kind}`]].join(' ')}>
      <div className={styles.groupHeader}>
        <span className={styles.groupTitle}>{title}</span>
        <span className={[styles.badge, styles[`badge_${group.kind}`]].join(' ')}>{text.instruction}</span>
        <Button size="small" variant="ghost" onClick={() => onChange(removeGroup(draft, group.key))} style={{ marginLeft: 'auto' }}>
          {removeLabel}
        </Button>
      </div>
      {group.kind === 'alternatives' ? (
        <input
          aria-label="Nome do bloco"
          placeholder="Nome do bloco (ex.: Carboidrato)"
          className={styles.input}
          value={group.label}
          onChange={(e) => onChange(updateGroup(draft, group.key, (x) => ({ ...x, label: e.target.value })))}
        />
      ) : null}
      <Warnings live={groupWarnings(group)} notices={[]} onDismiss={() => undefined} />

      {group.kind === 'fixed' ? (
        group.choices.map((choice) => (
          <div key={choice.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FoodList draft={draft} choice={choice} onChange={onChange} onPick={onPick} />
            <div>
              <Button size="small" variant="ghost" onClick={() => onPick(choice.key, null, '')}>
                + Alimento
              </Button>
            </div>
          </div>
        ))
      ) : group.kind === 'meal_options' ? (
        <div className={styles.optionGrid}>
          {group.choices.map((choice, i) => (
            <article key={choice.key} aria-label={choiceTitle(choice, i)} className={styles.optionCard}>
              <input
                aria-label={`Nome da ${choiceTitle(choice, i)}`}
                className={styles.input}
                value={choice.label}
                onChange={(e) => onChange(updateChoice(draft, choice.key, (x) => ({ ...x, label: e.target.value })))}
              />
              <Warnings live={choiceWarnings(group, choice)} notices={[]} onDismiss={() => undefined} />
              <FoodList draft={draft} choice={choice} onChange={onChange} onPick={onPick} />
              {choiceActions(choice, 'Remover opção')}
            </article>
          ))}
        </div>
      ) : (
        group.choices.map((choice, i) => (
          <div key={choice.key} role="group" aria-label={`Alternativa ${i + 1}`} className={styles.alternative}>
            <span className={styles.radio} aria-hidden />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Warnings live={choiceWarnings(group, choice)} notices={[]} onDismiss={() => undefined} />
              <FoodList draft={draft} choice={choice} onChange={onChange} onPick={onPick} />
              {choiceActions(choice, 'Remover alternativa')}
            </div>
          </div>
        ))
      )}

      {group.kind !== 'fixed' ? (
        <div>
          <Button
            size="small"
            variant="secondary"
            onClick={() =>
              onChange(updateGroup(draft, group.key, (x) => ({ ...x, choices: [...x.choices, emptyChoice(group.kind === 'meal_options' ? `Opção ${x.choices.length + 1}` : '')] })))
            }
          >
            {group.kind === 'meal_options' ? '+ Opção' : '+ Alternativa'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FoodList({ draft, choice, onChange, onPick }: { draft: DietDraft; choice: DraftChoice; onChange: Change; onPick: PickFood }) {
  if (choice.foods.length === 0) return <div className={styles.muted}>Sem alimentos.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {choice.foods.map((food) => (
        <FoodReview key={food.key} draft={draft} choiceKey={choice.key} food={food} onChange={onChange} onPick={onPick} />
      ))}
    </div>
  );
}

function FoodReview({ draft, choiceKey, food, onChange, onPick }: { draft: DietDraft; choiceKey: string; food: DraftFood; onChange: Change; onPick: PickFood }) {
  const name = foodDisplayName(food);
  const set = (patch: Partial<DraftFood>) => onChange(updateFood(draft, food.key, (x) => ({ ...x, ...patch })));

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className={styles.muted}>
        {food.sourceText ? (
          <>
            Texto original: <q>{food.sourceText}</q>
          </>
        ) : (
          'Adicionado na revisão'
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {food.food ? (
          <strong style={{ fontSize: 13.5 }}>{food.food.name}</strong>
        ) : food.customName !== null ? (
          <>
            <input aria-label={`Nome livre de ${food.rawFood ?? 'alimento'}`} className={styles.input} value={food.customName} onChange={(e) => set({ customName: e.target.value })} />
            <span className={styles.noCalc}>Sem cálculo</span>
          </>
        ) : (
          <span style={{ fontSize: 13.5, color: 'var(--color-danger)' }}>{food.rawFood ?? 'Alimento'} — não identificado</span>
        )}
        <Button size="small" variant="secondary" onClick={() => onPick(choiceKey, food.key, food.rawFood ?? '')}>
          {food.food ? 'Trocar' : 'Escolher no catálogo'}
        </Button>
        {!food.food && food.customName === null ? (
          <Button size="small" variant="ghost" onClick={() => onChange(updateFood(draft, food.key, asCustomName))}>
            Usar como nome livre
          </Button>
        ) : null}
      </div>
      {!food.food && food.customName === null && food.candidates.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={styles.muted}>Sugestões do catálogo:</span>
          {food.candidates.map((candidate) => (
            <Button key={candidate.id} size="small" variant="secondary" onClick={() => onChange(updateFood(draft, food.key, (x) => selectFood(x, candidate)))}>
              {candidate.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            aria-label={`À vontade: ${name}`}
            checked={food.freeQuantity}
            onChange={(e) => set(e.target.checked ? { freeQuantity: true, quantity: null, quantityMax: null, unit: null } : { freeQuantity: false })}
          />
          À vontade
        </label>
        {!food.freeQuantity ? (
          <>
            <input
              inputMode="decimal"
              aria-label={`Quantidade de ${name}`}
              className={styles.input}
              style={{ width: 90 }}
              value={food.quantity ?? ''}
              onChange={(e) => set({ quantity: numberOrNull(e.target.value) })}
            />
            <span className={styles.muted}>até</span>
            <input
              inputMode="decimal"
              aria-label={`Quantidade máxima de ${name}`}
              className={styles.input}
              style={{ width: 80 }}
              value={food.quantityMax ?? ''}
              onChange={(e) => set({ quantityMax: numberOrNull(e.target.value) })}
            />
            <select aria-label={`Unidade de ${name}`} className={styles.input} style={{ width: 170 }} value={food.unit ?? ''} onChange={(e) => set({ unit: (e.target.value || null) as NutritionUnit | null })}>
              <option value="">Unidade…</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Button size="small" variant="ghost" onClick={() => onChange(removeFood(draft, food.key))}>
          Remover
        </Button>
      </div>
      <input aria-label="Observação do alimento" placeholder="Observação (opcional)" className={styles.input} value={food.notes} onChange={(e) => set({ notes: e.target.value })} />
      <Warnings live={foodWarnings(food)} notices={food.notices} onDismiss={(w) => set({ notices: withoutNotice(food.notices, w) })} />
    </div>
  );
}

function SupplementsReview({ draft, onChange }: { draft: DietDraft; onChange: Change }) {
  return (
    <section aria-label="Suplementação">
      <Card title="Suplementação">
        {draft.supplements.length === 0 ? <div className={styles.muted}>Nenhum suplemento no texto.</div> : null}
        {draft.supplements.map((s, i) => {
          const set = (patch: Partial<typeof s>) => onChange(updateSupplement(draft, s.key, (x) => ({ ...x, ...patch })));
          const label = s.name.trim() || `suplemento ${i + 1}`;
          return (
            <div key={s.key} className={styles.supplement} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input aria-label={`Nome do suplemento ${i + 1}`} className={styles.input} style={{ flex: 1, minWidth: 160 }} value={s.name} onChange={(e) => set({ name: e.target.value })} />
                <input aria-label={`Quantidade de ${label}`} inputMode="decimal" className={styles.input} style={{ width: 80 }} value={s.quantity ?? ''} onChange={(e) => set({ quantity: numberOrNull(e.target.value) })} />
                <span className={styles.muted}>até</span>
                <input
                  aria-label={`Quantidade máxima de ${label}`}
                  inputMode="decimal"
                  className={styles.input}
                  style={{ width: 80 }}
                  value={s.quantityMax ?? ''}
                  onChange={(e) => set({ quantityMax: numberOrNull(e.target.value) })}
                />
                <input aria-label={`Unidade de ${label}`} placeholder="Unidade" className={styles.input} style={{ width: 110 }} value={s.unitText} onChange={(e) => set({ unitText: e.target.value })} />
                <Button size="small" variant="ghost" onClick={() => onChange(removeSupplement(draft, s.key))}>
                  Remover
                </Button>
              </div>
              <input aria-label={`Quando tomar ${label}`} placeholder="Quando tomar" className={styles.input} value={s.timing} onChange={(e) => set({ timing: e.target.value })} />
              <input aria-label={`Observações de ${label}`} placeholder="Observações" className={styles.input} value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
              <Warnings live={[]} notices={s.notices} onDismiss={(w) => set({ notices: withoutNotice(s.notices, w) })} />
            </div>
          );
        })}
        <div>
          <Button size="small" variant="secondary" onClick={() => onChange({ ...draft, supplements: [...draft.supplements, emptySupplement()] })}>
            + Suplemento
          </Button>
        </div>
      </Card>
    </section>
  );
}
