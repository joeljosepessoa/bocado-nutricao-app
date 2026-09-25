import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { ExercisePreview } from '../components/ExercisePreview';
import { describeExercise } from '../lib/exerciseMedia';
import type { CatalogExerciseRef } from '../types/api';

interface Props {
  title: string;
  initialSearch?: string;
  confirmLabel: string;
  onPick: (exercise: CatalogExerciseRef) => void;
  onClose: () => void;
}

/** Só exercícios do catálogo visível ao profissional — nunca cria exercício novo. */
export function ExercisePickerModal({ title, initialSearch = '', confirmLabel, onPick, onClose }: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [selectedId, setSelectedId] = useState('');

  const { data: exercises, isLoading } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => api.listExercises(search || undefined),
  });
  const selected = (exercises ?? []).find((exercise) => exercise.id === selectedId);

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onPick({
                id: selected.id,
                name: selected.name,
                muscleGroup: selected.muscleGroup,
                equipment: selected.equipment,
                imageUrl: selected.imageUrl,
              });
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Buscar no catálogo" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div
          role="listbox"
          aria-label="Exercícios do catálogo"
          style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}
        >
          {isLoading ? <div style={{ padding: 12, fontSize: 13 }}>Buscando…</div> : null}
          {!isLoading && (exercises ?? []).length === 0 ? (
            <div style={{ padding: 12, fontSize: 13 }}>Nenhum exercício encontrado no catálogo.</div>
          ) : null}
          {(exercises ?? []).map((exercise) => {
            const isSelected = exercise.id === selectedId;
            const detail = describeExercise(exercise);
            return (
              <button
                key={exercise.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => setSelectedId(exercise.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  background: isSelected ? 'var(--color-primary-light)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{exercise.name}</span>
                  {detail ? <span style={{ display: 'block', fontSize: 12, opacity: 0.75 }}>{detail}</span> : null}
                </span>
                {exercise.imageUrl ? (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    GIF
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selected ? <ExercisePreview key={selected.id} exercise={selected} /> : null}
      </div>
    </Modal>
  );
}
