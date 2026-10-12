import { useState, type CSSProperties, type FormEvent } from 'react';
import * as api from '../api/endpoints';
import { Button } from './Button';
import { TextField } from './TextField';
import { EXERCISE_TYPES, sameExerciseName } from '../lib/exerciseMedia';
import type { Exercise, ExerciseType } from '../types/api';

const fieldStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  fontSize: 14,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
};
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 };
const captionStyle: CSSProperties = { color: 'var(--color-text-secondary)', fontWeight: 600 };

function errorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : 'Não foi possível cadastrar o exercício.';
}

/**
 * Cadastro de um exercício que não está no catálogo. Entra no catálogo
 * PARTICULAR do profissional (só ele vê) e já pode ser usado no treino — sem
 * GIF, que é opcional. Quem cadastra é sempre a pessoa: a IA nunca cria exercício.
 */
export function NewExerciseForm({
  initialName = '',
  initialMuscleGroup = '',
  onCreated,
  onCancel,
}: {
  initialName?: string;
  initialMuscleGroup?: string;
  onCreated: (exercise: Exercise) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [muscleGroup, setMuscleGroup] = useState(initialMuscleGroup);
  const [equipment, setEquipment] = useState('');
  const [type, setType] = useState<ExerciseType>('strength');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Informe o nome do exercício.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Dois exercícios com o mesmo nome deixam o Assistente sem saber qual usar.
      const existing = await api.listExercises(trimmed);
      if (existing.some((exercise) => sameExerciseName(exercise.name, trimmed))) {
        setError('Já existe um exercício com esse nome no catálogo — volte e selecione-o na lista.');
        return;
      }
      onCreated(
        await api.createExercise({
          name: trimmed,
          type,
          scope: 'private',
          ...(muscleGroup.trim() ? { muscleGroup: muscleGroup.trim() } : {}),
          ...(equipment.trim() ? { equipment: equipment.trim() } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Cadastrar novo exercício" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        O exercício entra no seu catálogo (só você vê) e já pode ser usado nos treinos. A demonstração em GIF é opcional e pode ser incluída depois.
      </div>
      <TextField label="Nome do exercício" value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <TextField label="Grupo muscular" placeholder="Ex.: Peitoral" value={muscleGroup} maxLength={200} onChange={(e) => setMuscleGroup(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <TextField label="Equipamento" placeholder="Ex.: Halteres" value={equipment} maxLength={200} onChange={(e) => setEquipment(e.target.value)} />
        </div>
      </div>
      <label style={labelStyle}>
        <span style={captionStyle}>Tipo</span>
        <select style={fieldStyle} value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
          {EXERCISE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        <span style={captionStyle}>Como executar (o aluno vê no app)</span>
        <textarea style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }} value={instructions} maxLength={2000} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      {error ? (
        <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Voltar à lista
        </Button>
        <Button type="submit" loading={saving}>
          Cadastrar exercício
        </Button>
      </div>
    </form>
  );
}
