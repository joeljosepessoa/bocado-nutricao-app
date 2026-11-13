import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ONE_UNIT_LABELS, UNITS } from '../dietAssistant/draft';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { NutritionUnit } from '../types/api';
import { fmt, parseDecimal } from './foodFormat';

/**
 * Peso por unidade ("1 fatia de pão de forma = 25 g"), informado pelo
 * nutricionista — o sistema nunca adivinha esse número. Com `unit` fixa (item
 * da dieta) só pergunta o peso; sem ela (ficha do alimento) deixa escolher a medida.
 */
export function UnitWeightModal({
  foodId,
  unit: fixedUnit,
  onClose,
  onSaved,
}: {
  foodId: string;
  unit?: NutritionUnit;
  onClose: () => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const queryClient = useQueryClient();
  const { data: food, isError } = useQuery({ queryKey: ['food-details', foodId], queryFn: () => api.getFoodDetails(foodId) });
  const measures = UNITS.filter((u) => u !== food?.baseUnit && u !== 'g' && u !== 'ml');
  const [unit, setUnit] = useState<NutritionUnit>(fixedUnit ?? 'unit');
  const [grams, setGrams] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = food?.unitConversions.find((c) => c.unit === unit);
  const baseUnit = food?.baseUnit ?? 'g';
  const one = `1 ${ONE_UNIT_LABELS[unit] ?? unit}`;

  async function save() {
    const value = parseDecimal(grams);
    if (value == null || value <= 0 || value > 5000) {
      setError(`Informe quanto pesa ${one}, em ${baseUnit} (ex.: 25).`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setFoodUnitConversion(foodId, unit, value);
      await queryClient.invalidateQueries({ queryKey: ['food-details', foodId] });
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar o peso.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Peso por unidade"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!food}>
            Salvar peso
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
        {!food ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>{isError ? 'Não foi possível carregar o alimento.' : 'Carregando…'}</span>
        ) : (
          <>
            <div style={{ fontWeight: 600 }}>{food.name}</div>
            {!fixedUnit ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Medida</span>
                <select aria-label="Medida" value={unit} onChange={(e) => setUnit(e.target.value as NutritionUnit)} style={{ padding: 6, borderRadius: 6 }}>
                  {measures.map((u) => (
                    <option key={u} value={u}>
                      {ONE_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>
                Quanto pesa {one}? ({baseUnit})
              </span>
              <input
                aria-label={`Peso de ${one}`}
                inputMode="decimal"
                value={grams}
                placeholder={existing ? fmt(existing.gramsEquivalent, 1) : 'Ex.: 25'}
                onChange={(e) => setGrams(e.target.value)}
                style={{ width: 120, padding: 6, borderRadius: 6 }}
                autoFocus
              />
            </label>
            {existing ? (
              <span style={{ color: 'var(--color-text-secondary)' }}>
                Hoje: {one} = {fmt(existing.gramsEquivalent, 1)} {baseUnit}. O novo peso substitui este.
              </span>
            ) : null}
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Vale para este alimento em todas as dietas a partir de agora. Os rascunhos são recalculados na hora; dieta já publicada não muda.
            </span>
            {error ? (
              <span role="alert" style={{ color: 'var(--color-danger)' }}>
                {error}
              </span>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
