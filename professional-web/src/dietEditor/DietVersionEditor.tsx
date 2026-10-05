import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { FoodPickerModal } from '../dietAssistant/FoodPickerModal';
import { UNIT_LABELS, UNITS } from '../dietAssistant/draft';
import type { DietVersion, Meal, MealFood, NutritionUnit } from '../types/api';

const inputStyle = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13.5,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

interface Props {
  clientId: string;
  dietId: string;
  version: DietVersion;
  onChanged: () => Promise<unknown> | void;
}

/** Editor do RASCUNHO (versão publicada nunca é editada — "Editar dieta" abre um rascunho novo). */
export function DietVersionEditor({ clientId, dietId, version, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState(version.objective ?? '');
  const [notes, setNotes] = useState(version.notes ?? '');
  const [newMeal, setNewMeal] = useState('');
  const [pickerMealId, setPickerMealId] = useState<string | null>(null);
  const [confirmRemoveMeal, setConfirmRemoveMeal] = useState<Meal | null>(null);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, fallback));
    }
  };

  const saveVersion = useMutation({
    mutationFn: () => run(() => api.updateDietVersion(clientId, dietId, version.id, { objective, notes }), 'Não foi possível salvar os dados da dieta.'),
  });

  const addMeal = useMutation({
    mutationFn: (name: string) => run(() => api.createMeal(clientId, dietId, version.id, { name }), 'Não foi possível adicionar a refeição.'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error ? (
        <div role="alert" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
          {error}
        </div>
      ) : null}

      <Card title="Dados da dieta">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Objetivo</span>
            <input style={inputStyle} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: Hipertrofia" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Observações</span>
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div>
            <Button size="small" variant="secondary" onClick={() => saveVersion.mutate()} loading={saveVersion.isPending}>
              Salvar dados
            </Button>
          </div>
        </div>
      </Card>

      {version.meals.map((meal) => (
        <MealEditor
          key={meal.id}
          meal={meal}
          onRename={(input) => run(() => api.updateMeal(clientId, dietId, version.id, meal.id, input), 'Não foi possível salvar a refeição.')}
          onRemove={() => setConfirmRemoveMeal(meal)}
          onAddFood={() => setPickerMealId(meal.id)}
          onUpdateFood={(food, input) =>
            run(() => api.updateMealFood(clientId, dietId, version.id, meal.id, food.id, input), 'Não foi possível salvar o alimento.')
          }
          onRemoveFood={(food) => run(() => api.deleteMealFood(clientId, dietId, version.id, meal.id, food.id), 'Não foi possível remover o alimento.')}
        />
      ))}

      <Card>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 1, minWidth: 200 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Nova refeição</span>
            <input style={inputStyle} placeholder="Ex.: Café da manhã" value={newMeal} onChange={(e) => setNewMeal(e.target.value)} />
          </label>
          <Button
            onClick={() => {
              if (newMeal.trim()) {
                addMeal.mutate(newMeal.trim());
                setNewMeal('');
              }
            }}
            loading={addMeal.isPending}
          >
            Adicionar refeição
          </Button>
        </div>
      </Card>

      {pickerMealId ? (
        <AddFoodToMeal
          onClose={() => setPickerMealId(null)}
          onAdd={(foodId, quantity, unit) =>
            run(() => api.addMealFood(clientId, dietId, version.id, pickerMealId, { foodId, quantity, unit }), 'Não foi possível adicionar o alimento.')
          }
        />
      ) : null}

      {confirmRemoveMeal ? (
        <ConfirmDialog
          title="Remover esta refeição?"
          description={`"${confirmRemoveMeal.name}" e os alimentos dela saem deste rascunho. A versão publicada não é alterada.`}
          confirmLabel="Remover refeição"
          danger
          onConfirm={() => run(() => api.deleteMeal(clientId, dietId, version.id, confirmRemoveMeal.id), 'Não foi possível remover a refeição.')}
          onClose={() => setConfirmRemoveMeal(null)}
        />
      ) : null}
    </div>
  );
}

function MealEditor({
  meal,
  onRename,
  onRemove,
  onAddFood,
  onUpdateFood,
  onRemoveFood,
}: {
  meal: Meal;
  onRename: (input: { name?: string; time?: string; notes?: string }) => Promise<unknown>;
  onRemove: () => void;
  onAddFood: () => void;
  onUpdateFood: (food: MealFood, input: { quantity?: number; unit?: string; notes?: string }) => Promise<unknown>;
  onRemoveFood: (food: MealFood) => Promise<unknown>;
}) {
  const [name, setName] = useState(meal.name);
  const [time, setTime] = useState(meal.time ?? '');

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 2, minWidth: 180 }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Refeição</span>
          <input
            style={inputStyle}
            aria-label="Nome da refeição"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== meal.name && onRename({ name: name.trim() })}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, width: 120 }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Horário</span>
          <input
            type="time"
            style={inputStyle}
            aria-label="Horário da refeição"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => time && time !== (meal.time ?? '') && onRename({ time })}
          />
        </label>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>{meal.totals ? `${meal.totals.kcal} kcal` : null}</span>
        <Button size="small" variant="ghost" onClick={onRemove}>
          Remover refeição
        </Button>
      </div>

      {meal.foods.length === 0 ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum alimento ainda.</div> : null}
      {meal.foods.map((food) => (
        <FoodRow key={food.id} food={food} onUpdate={(input) => onUpdateFood(food, input)} onRemove={() => onRemoveFood(food)} />
      ))}
      <div>
        <Button size="small" variant="ghost" onClick={onAddFood}>
          + Alimento
        </Button>
      </div>
    </Card>
  );
}

function FoodRow({
  food,
  onUpdate,
  onRemove,
}: {
  food: MealFood;
  onUpdate: (input: { quantity?: number; unit?: string }) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [quantity, setQuantity] = useState(String(food.quantity));
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
      <span style={{ flex: 2, minWidth: 160, fontSize: 13.5, fontWeight: 600 }}>{food.food?.name ?? food.foodId}</span>
      <input
        type="number"
        min="0"
        step="any"
        aria-label={`Quantidade de ${food.food?.name ?? 'alimento'}`}
        style={{ ...inputStyle, width: 90 }}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={() => Number(quantity) > 0 && Number(quantity) !== food.quantity && onUpdate({ quantity: Number(quantity) })}
      />
      <select
        aria-label={`Unidade de ${food.food?.name ?? 'alimento'}`}
        style={{ ...inputStyle, width: 170 }}
        value={food.unit}
        onChange={(e) => onUpdate({ unit: e.target.value })}
      >
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {UNIT_LABELS[unit]}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 70 }}>{food.kcal ?? '—'} kcal</span>
      <Button size="small" variant="ghost" onClick={() => onRemove()}>
        Remover
      </Button>
    </div>
  );
}

function AddFoodToMeal({ onClose, onAdd }: { onClose: () => void; onAdd: (foodId: string, quantity: number, unit: NutritionUnit) => Promise<unknown> }) {
  const [food, setFood] = useState<{ id: string; name: string } | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState<NutritionUnit>('g');

  const [saving, setSaving] = useState(false);

  if (!food) {
    return <FoodPickerModal onClose={onClose} onSelect={setFood} />;
  }
  return (
    <Modal
      title={`Adicionar ${food.name}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={saving}
            disabled={!(Number(quantity) > 0)}
            onClick={async () => {
              setSaving(true);
              try {
                await onAdd(food.id, Number(quantity), unit);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" min="0" step="any" aria-label="Quantidade" style={{ ...inputStyle, width: 110 }} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <select aria-label="Unidade" style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value as NutritionUnit)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
