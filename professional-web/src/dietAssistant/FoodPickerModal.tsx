import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import type { CatalogFoodRef } from '../types/api';

/** Escolha manual no catálogo de alimentos visíveis — o profissional decide a correspondência. */
export function FoodPickerModal({
  initialSearch = '',
  onSelect,
  onClose,
}: {
  initialSearch?: string;
  onSelect: (food: CatalogFoodRef) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(initialSearch);
  const { data: foods, isLoading } = useQuery({ queryKey: ['foods', search], queryFn: () => api.listFoods(search || undefined) });

  return (
    <Modal
      title="Escolher alimento do catálogo"
      onClose={onClose}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TextField label="Buscar alimento" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isLoading ? <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Buscando…</span> : null}
          {!isLoading && (foods ?? []).length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Nenhum alimento encontrado. Cadastre-o no catálogo de alimentos antes de usar na dieta.
            </span>
          ) : null}
          {(foods ?? []).map((food) => (
            <button
              key={food.id}
              type="button"
              onClick={() => {
                onSelect({ id: food.id, name: food.name });
                onClose();
              }}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer',
                fontSize: 13.5,
              }}
            >
              {food.name}
              <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                {food.kcalPer100 != null ? `${Math.round(food.kcalPer100)} kcal / 100 ${food.baseUnit}` : 'kcal sem número na TACO'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
