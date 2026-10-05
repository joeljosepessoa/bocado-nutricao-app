import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { ExercisePreview } from '../components/ExercisePreview';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { describeExercise } from '../lib/exerciseMedia';

/**
 * Escolha de um exercício do CATÁLOGO (id estruturado vindo da API; o GIF é
 * sempre o do próprio exercício). Usado para adicionar e para trocar um
 * exercício do treino — o frontend nunca inventa id nem mídia.
 */
export function CatalogExerciseModal({
  title,
  confirmLabel,
  onClose,
  onConfirm,
  error,
}: {
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (exerciseId: string) => Promise<unknown>;
  error?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: exercises } = useQuery({ queryKey: ['exercises', search], queryFn: () => api.listExercises(search || undefined) });
  const selectedExercise = (exercises ?? []).find((ex) => ex.id === exerciseId);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(exerciseId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirm} loading={saving} disabled={!exerciseId}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Buscar exercício" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div
          role="listbox"
          aria-label="Exercícios"
          style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}
        >
          {(exercises ?? []).length === 0 ? <div style={{ padding: 12, fontSize: 13 }}>Nenhum exercício encontrado.</div> : null}
          {(exercises ?? []).map((ex) => {
            const selected = ex.id === exerciseId;
            const detail = describeExercise(ex);
            return (
              <button
                key={ex.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => setExerciseId(ex.id)}
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
                  background: selected ? 'var(--color-primary-soft, #e6f4ec)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{ex.name}</span>
                  {detail ? <span style={{ display: 'block', fontSize: 12, opacity: 0.75 }}>{detail}</span> : null}
                </span>
                {ex.imageUrl ? (
                  <span
                    title="Tem demonstração em GIF"
                    style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  >
                    GIF
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selectedExercise ? <ExercisePreview key={selectedExercise.id} exercise={selectedExercise} /> : null}
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
