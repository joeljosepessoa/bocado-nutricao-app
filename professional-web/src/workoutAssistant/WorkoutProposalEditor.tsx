import { useState } from 'react';
import type React from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExerciseGif } from '../components/ExerciseGif';
import { describeExercise } from '../lib/exerciseMedia';
import type { CatalogExerciseRef } from '../types/api';
import {
  dayWarnings,
  exerciseWarnings,
  manualExercise,
  moveExercise,
  removeDay,
  removeExercise,
  selectExercise,
  updateDay,
  updateExercise,
  withoutNotice,
  type DraftDay,
  type DraftExercise,
  type WorkoutDraft,
} from './draft';
import { ExercisePickerModal } from './ExercisePickerModal';
import { SetsEditor } from './SetsEditor';

interface Props {
  draft: WorkoutDraft;
  onChange: (draft: WorkoutDraft) => void;
}

type Picker = { mode: 'replace'; dayKey: string; exerciseKey: string; search: string } | { mode: 'add'; dayKey: string };

const textareaStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 8,
  fontFamily: 'inherit',
  fontSize: 13,
  resize: 'vertical',
};

export function WarningList({ warnings, notices, onDismiss }: { warnings: string[]; notices: string[]; onDismiss: (notice: string) => void }) {
  if (warnings.length === 0 && notices.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {warnings.map((warning) => (
        <li key={`w-${warning}`} role="alert" style={warningStyle}>
          ⚠ {warning}
        </li>
      ))}
      {notices.map((notice) => (
        <li key={`n-${notice}`} style={{ ...warningStyle, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span>⚠ {notice}</span>
          <Button size="small" variant="ghost" aria-label={`Marcar como revisado: ${notice}`} onClick={() => onDismiss(notice)}>
            Revisado
          </Button>
        </li>
      ))}
    </ul>
  );
}

const warningStyle: React.CSSProperties = {
  fontSize: 12.5,
  padding: '4px 8px',
  borderLeft: '3px solid var(--color-accent)',
  background: 'var(--color-bg)',
  borderRadius: 4,
};

function matchBadge(exercise: DraftExercise): { label: string; color: string } {
  if (exercise.exercise) {
    return exercise.match === 'matched'
      ? { label: '✓ Encontrado no catálogo', color: 'var(--color-success)' }
      : { label: '✓ Selecionado por você', color: 'var(--color-success)' };
  }
  if (exercise.match === 'ambiguous') return { label: '⚠ Correspondência ambígua', color: 'var(--color-accent)' };
  if (exercise.match === 'not_found') return { label: '⚠ Não encontrado no catálogo', color: 'var(--color-danger)' };
  return { label: '⚠ Sem exercício selecionado', color: 'var(--color-danger)' };
}

function ExerciseCard({
  exercise,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  onOpenPicker,
}: {
  exercise: DraftExercise;
  index: number;
  total: number;
  onChange: (exercise: DraftExercise) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onOpenPicker: () => void;
}) {
  const badge = matchBadge(exercise);
  const title = exercise.exercise?.name ?? exercise.rawName ?? 'Exercício';
  const detail = exercise.exercise ? describeExercise(exercise.exercise) : exercise.muscleGroupHint;

  return (
    <section
      aria-label={`Exercício ${index + 1}: ${title}`}
      style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>
          {detail ? <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{detail}</div> : null}
          {exercise.rawName && exercise.exercise && exercise.rawName !== exercise.exercise.name ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Lido no texto: “{exercise.rawName}”</div>
          ) : null}
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: badge.color }}>{badge.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Button size="small" variant="secondary" onClick={onOpenPicker}>
            {exercise.exercise ? 'Trocar exercício' : 'Selecionar do catálogo'}
          </Button>
          <Button size="small" variant="ghost" aria-label="Mover exercício para cima" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button size="small" variant="ghost" aria-label="Mover exercício para baixo" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓
          </Button>
          <Button size="small" variant="ghost" onClick={onRemove}>
            Remover exercício
          </Button>
        </div>
      </div>

      {exercise.exercise ? (
        <div aria-label={`GIF de ${exercise.exercise.name}`}>
          <ExerciseGif exercise={exercise.exercise} />
        </div>
      ) : null}

      {!exercise.exercise && exercise.candidates.length > 0 ? (
        <div style={{ fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Possíveis correspondências no catálogo — escolha uma:</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {exercise.candidates.map((candidate: CatalogExerciseRef) => (
              <div
                key={candidate.id}
                role="group"
                aria-label={`Opção: ${candidate.name}`}
                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, width: 238 }}
              >
                <ExerciseGif exercise={candidate} />
                <Button size="small" variant="secondary" onClick={() => onChange(selectExercise(exercise, candidate))}>
                  Usar “{candidate.name}”{describeExercise(candidate) ? ` (${describeExercise(candidate)})` : ''}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Observações / técnica
        <textarea
          aria-label={`Observações do exercício ${index + 1}`}
          rows={2}
          maxLength={1000}
          value={exercise.notes}
          onChange={(e) => onChange({ ...exercise, notes: e.target.value })}
          style={textareaStyle}
        />
      </label>

      <SetsEditor sets={exercise.sets} onChange={(sets) => onChange({ ...exercise, sets })} />

      <WarningList
        warnings={exerciseWarnings(exercise)}
        notices={exercise.notices}
        onDismiss={(notice) => onChange({ ...exercise, notices: withoutNotice(exercise.notices, notice) })}
      />
    </section>
  );
}

function DayCard({
  day,
  index,
  draft,
  onChange,
  onPicker,
}: {
  day: DraftDay;
  index: number;
  draft: WorkoutDraft;
  onChange: (draft: WorkoutDraft) => void;
  onPicker: (picker: Picker) => void;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Dia {index + 1}
            <input
              aria-label={`Nome do dia ${index + 1}`}
              value={day.name}
              maxLength={200}
              onChange={(e) => onChange(updateDay(draft, day.key, (d) => ({ ...d, name: e.target.value })))}
              style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px', fontSize: 15, fontWeight: 700 }}
            />
          </label>
          <Button size="small" variant="ghost" onClick={() => onChange(removeDay(draft, day.key))}>
            Remover dia
          </Button>
        </div>

        <WarningList
          warnings={dayWarnings(day)}
          notices={day.notices}
          onDismiss={(notice) => onChange(updateDay(draft, day.key, (d) => ({ ...d, notices: withoutNotice(d.notices, notice) })))}
        />

        {day.exercises.map((exercise, i) => (
          <ExerciseCard
            key={exercise.key}
            exercise={exercise}
            index={i}
            total={day.exercises.length}
            onChange={(next) => onChange(updateExercise(draft, day.key, exercise.key, () => next))}
            onMove={(direction) => onChange(moveExercise(draft, day.key, exercise.key, direction))}
            onRemove={() => onChange(removeExercise(draft, day.key, exercise.key))}
            onOpenPicker={() =>
              onPicker({ mode: 'replace', dayKey: day.key, exerciseKey: exercise.key, search: exercise.exercise?.name ?? exercise.rawName ?? '' })
            }
          />
        ))}

        <div>
          <Button size="small" variant="secondary" onClick={() => onPicker({ mode: 'add', dayKey: day.key })}>
            + Adicionar exercício do catálogo
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Revisão editável da proposta — nada vai ao servidor até "Criar treino como rascunho". */
export function WorkoutProposalEditor({ draft, onChange }: Props) {
  const [picker, setPicker] = useState<Picker | null>(null);

  function handlePick(chosen: CatalogExerciseRef) {
    if (!picker) return;
    if (picker.mode === 'replace') {
      onChange(updateExercise(draft, picker.dayKey, picker.exerciseKey, (exercise) => selectExercise(exercise, chosen)));
    } else {
      onChange(updateDay(draft, picker.dayKey, (day) => ({ ...day, exercises: [...day.exercises, manualExercise(chosen)] })));
    }
    setPicker(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <WarningList warnings={[]} notices={draft.notices} onDismiss={(notice) => onChange({ ...draft, notices: withoutNotice(draft.notices, notice) })} />

      {draft.days.map((day, i) => (
        <DayCard key={day.key} day={day} index={i} draft={draft} onChange={onChange} onPicker={setPicker} />
      ))}

      {picker ? (
        <ExercisePickerModal
          title={picker.mode === 'replace' ? 'Selecionar exercício do catálogo' : 'Adicionar exercício do catálogo'}
          confirmLabel={picker.mode === 'replace' ? 'Usar este exercício' : 'Adicionar'}
          initialSearch={picker.mode === 'replace' ? picker.search : ''}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
