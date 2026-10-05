import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { NutritionUnit } from '../types/api';
import {
  emptyMeal,
  foodWarnings,
  manualFood,
  mealWarnings,
  moveMeal,
  removeFood,
  removeMeal,
  selectFood,
  updateFood,
  updateMeal,
  UNIT_LABELS,
  UNITS,
  withoutNotice,
  type DietDraft,
  type DraftFood,
} from './draft';
import { FoodPickerModal } from './FoodPickerModal';

const inputStyle = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13.5,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;

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

/** Revisão da proposta da IA: nada é gravado aqui — só edita o rascunho em memória. */
export function DietProposalEditor({ draft, onChange }: { draft: DietDraft; onChange: (draft: DietDraft) => void }) {
  const [picker, setPicker] = useState<{ mealKey: string; foodKey: string | null; search: string } | null>(null);

  const setFood = (mealKey: string, foodKey: string, patch: Partial<DraftFood>) =>
    onChange(updateFood(draft, mealKey, foodKey, (food) => ({ ...food, ...patch })));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {draft.notices.length > 0 ? (
        <Card title="Revise antes de criar">
          <Warnings live={[]} notices={draft.notices} onDismiss={(n) => onChange({ ...draft, notices: withoutNotice(draft.notices, n) })} />
        </Card>
      ) : null}

      {draft.meals.map((meal, m) => (
        <Card key={meal.key}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 2, minWidth: 180 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Refeição</span>
              <input
                aria-label={`Nome da refeição ${m + 1}`}
                style={inputStyle}
                value={meal.name}
                onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, name: e.target.value })))}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, width: 120 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Horário</span>
              <input
                type="time"
                aria-label={`Horário da refeição ${m + 1}`}
                style={inputStyle}
                value={meal.time}
                onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, time: e.target.value })))}
              />
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              <Button size="small" variant="ghost" onClick={() => onChange(moveMeal(draft, meal.key, -1))} disabled={m === 0} aria-label="Mover refeição para cima">
                ↑
              </Button>
              <Button
                size="small"
                variant="ghost"
                onClick={() => onChange(moveMeal(draft, meal.key, 1))}
                disabled={m === draft.meals.length - 1}
                aria-label="Mover refeição para baixo"
              >
                ↓
              </Button>
              <Button size="small" variant="ghost" onClick={() => onChange(removeMeal(draft, meal.key))}>
                Remover refeição
              </Button>
            </div>
          </div>
          <input
            aria-label={`Observações da refeição ${m + 1}`}
            placeholder="Observações da refeição (opcional)"
            style={inputStyle}
            value={meal.notes}
            onChange={(e) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, notes: e.target.value })))}
          />
          <Warnings
            live={mealWarnings(meal)}
            notices={meal.notices}
            onDismiss={(n) => onChange(updateMeal(draft, meal.key, (x) => ({ ...x, notices: withoutNotice(x.notices, n) })))}
          />

          {meal.foods.map((food) => (
            <div key={food.key} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {food.sourceText ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Texto original: <q>{food.sourceText}</q>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Adicionado na revisão</div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 200, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {food.food ? (
                    <strong style={{ fontSize: 13.5 }}>{food.food.name}</strong>
                  ) : (
                    <span style={{ fontSize: 13.5, color: 'var(--color-danger)' }}>{food.rawFood ?? 'Alimento'} — não identificado</span>
                  )}
                  <Button size="small" variant="secondary" onClick={() => setPicker({ mealKey: meal.key, foodKey: food.key, search: food.rawFood ?? '' })}>
                    {food.food ? 'Trocar' : 'Escolher no catálogo'}
                  </Button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label={`Quantidade de ${food.food?.name ?? food.rawFood ?? 'alimento'}`}
                  style={{ ...inputStyle, width: 100 }}
                  value={food.quantity ?? ''}
                  onChange={(e) => setFood(meal.key, food.key, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <select
                  aria-label={`Unidade de ${food.food?.name ?? food.rawFood ?? 'alimento'}`}
                  style={{ ...inputStyle, width: 170 }}
                  value={food.unit ?? ''}
                  onChange={(e) => setFood(meal.key, food.key, { unit: (e.target.value || null) as NutritionUnit | null })}
                >
                  <option value="">Unidade…</option>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
                <Button size="small" variant="ghost" onClick={() => onChange(removeFood(draft, meal.key, food.key))}>
                  Remover
                </Button>
              </div>
              {!food.food && food.candidates.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Sugestões do catálogo:</span>
                  {food.candidates.map((candidate) => (
                    <Button
                      key={candidate.id}
                      size="small"
                      variant="secondary"
                      onClick={() => onChange(updateFood(draft, meal.key, food.key, (x) => selectFood(x, candidate)))}
                    >
                      {candidate.name}
                    </Button>
                  ))}
                </div>
              ) : null}
              <input
                aria-label="Observação do alimento"
                placeholder="Observação (opcional)"
                style={inputStyle}
                value={food.notes}
                onChange={(e) => setFood(meal.key, food.key, { notes: e.target.value })}
              />
              <Warnings
                live={foodWarnings(food)}
                notices={food.notices}
                onDismiss={(n) => setFood(meal.key, food.key, { notices: withoutNotice(food.notices, n) })}
              />
            </div>
          ))}

          <div>
            <Button size="small" variant="ghost" onClick={() => setPicker({ mealKey: meal.key, foodKey: null, search: '' })}>
              + Alimento
            </Button>
          </div>
        </Card>
      ))}

      <div>
        <Button variant="secondary" onClick={() => onChange({ ...draft, meals: [...draft.meals, emptyMeal()] })}>
          + Refeição
        </Button>
      </div>

      {picker ? (
        <FoodPickerModal
          initialSearch={picker.search}
          onClose={() => setPicker(null)}
          onSelect={(chosen) => {
            if (picker.foodKey) {
              onChange(updateFood(draft, picker.mealKey, picker.foodKey, (food) => selectFood(food, chosen)));
            } else {
              onChange(updateMeal(draft, picker.mealKey, (meal) => ({ ...meal, foods: [...meal.foods, manualFood(chosen)] })));
            }
          }}
        />
      ) : null}
    </div>
  );
}
