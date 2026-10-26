import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { setsText } from '../exercises/presetText';
import type { ExercisePreset } from '../types/api';

/** "+ Do meu preset": escolhe um preset (exercício + séries) para entrar pronto no dia do treino. */
export function PresetPickerModal({ onChoose, onClose }: { onChoose: (preset: ExercisePreset) => void; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['exercise-presets'], queryFn: api.listExercisePresets });
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const presets = (data ?? []).filter((p) => !term || p.exercise.name.toLocaleLowerCase('pt-BR').includes(term));

  return (
    <Modal
      title="Adicionar de um preset"
      onClose={onClose}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          aria-label="Buscar preset"
          placeholder="Buscar pelo exercício…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', font: 'inherit' }}
        />
        {isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando presets…</div>
        ) : (data ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Você ainda não tem presets. Crie em <strong>Exercícios</strong>, no menu, pelo botão "+ Preset".
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {presets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChoose(p)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    background: 'var(--color-surface)',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.exercise.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                    {setsText(p)}
                    {p.exercise.muscleGroups.length > 0 ? ` · ${p.exercise.muscleGroups.join(', ')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
