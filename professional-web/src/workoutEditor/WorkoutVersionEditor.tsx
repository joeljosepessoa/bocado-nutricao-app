import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExerciseGif } from '../components/ExerciseGif';
import { TextField } from '../components/TextField';
import { summarizeSets } from '../lib/workoutFormat';
import type { WorkoutDay, WorkoutExercise, WorkoutSet, WorkoutVersion } from '../types/api';
import { CatalogExerciseModal } from './CatalogExerciseModal';
import { formToSetInput, isSetInputError, setToForm, type SetForm } from './setFields';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

/** Troca a posição de `index` com a vizinha (`delta` = -1 sobe, +1 desce) e devolve os ids na nova ordem. */
function moved<T extends { id: string }>(items: T[], index: number, delta: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const target = index + delta;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

type Confirm = { title: string; description: string; confirmLabel: string; action: () => Promise<unknown> };
type CatalogModal = { kind: 'add'; dayId: string } | { kind: 'replace'; dayId: string; workoutExerciseId: string; name: string };

/**
 * Editor de uma versão EM RASCUNHO. Toda alteração vai para a API granular já
 * existente (dias/exercícios/séries) e recarrega a versão; a publicada nunca é
 * tocada aqui — o rascunho só chega à cliente quando for publicado.
 */
export function WorkoutVersionEditor({
  clientId,
  workoutId,
  version,
  onChanged,
}: {
  clientId: string;
  workoutId: string;
  version: WorkoutVersion;
  onChanged: () => Promise<unknown> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [catalog, setCatalog] = useState<CatalogModal | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const ids = { clientId, workoutId, versionId: version.id };

  /** Executa uma alteração; erro da API vira mensagem na tela (nada some em silêncio). */
  async function run(action: () => Promise<unknown>, fallback = 'Não foi possível salvar a alteração.'): Promise<boolean> {
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    }
  }

  async function pickFromCatalog(exerciseId: string) {
    if (!catalog) return;
    setCatalogError(null);
    try {
      if (catalog.kind === 'add') {
        await api.addWorkoutExercise(ids.clientId, ids.workoutId, ids.versionId, catalog.dayId, { exerciseId });
      } else {
        await api.updateWorkoutExercise(ids.clientId, ids.workoutId, ids.versionId, catalog.dayId, catalog.workoutExerciseId, { exerciseId });
      }
      await onChanged();
      setCatalog(null);
    } catch (err) {
      setCatalogError(errorMessage(err, 'Não foi possível usar este exercício.'));
    }
  }

  const days = version.days;

  return (
    <>
      {error ? (
        <div role="alert" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
          {error}
        </div>
      ) : null}

      {days.map((day, dayIndex) => (
        <DayEditor
          key={day.id}
          day={day}
          canMoveUp={dayIndex > 0}
          canMoveDown={dayIndex < days.length - 1}
          onMove={(delta) => run(() => api.reorderWorkoutDays(ids.clientId, ids.workoutId, ids.versionId, moved(days, dayIndex, delta)))}
          onSaveDay={(input) => run(() => api.updateWorkoutDay(ids.clientId, ids.workoutId, ids.versionId, day.id, input))}
          onRemoveDay={() =>
            setConfirm({
              title: 'Remover este dia?',
              description: `O dia "${day.name}" e os exercícios dele saem deste rascunho. A versão publicada não muda.`,
              confirmLabel: 'Remover dia',
              action: () => run(() => api.deleteWorkoutDay(ids.clientId, ids.workoutId, ids.versionId, day.id)),
            })
          }
          onAddExercise={() => {
            setCatalogError(null);
            setCatalog({ kind: 'add', dayId: day.id });
          }}
          renderExercise={(exercise, index) => (
            <ExerciseEditor
              key={exercise.id}
              exercise={exercise}
              canMoveUp={index > 0}
              canMoveDown={index < day.exercises.length - 1}
              onMove={(delta) =>
                run(() => api.reorderWorkoutExercises(ids.clientId, ids.workoutId, ids.versionId, day.id, moved(day.exercises, index, delta)))
              }
              onSaveNotes={(notes) => run(() => api.updateWorkoutExercise(ids.clientId, ids.workoutId, ids.versionId, day.id, exercise.id, { notes }))}
              onReplace={() => {
                setCatalogError(null);
                setCatalog({ kind: 'replace', dayId: day.id, workoutExerciseId: exercise.id, name: exercise.exercise.name });
              }}
              onRemove={() =>
                setConfirm({
                  title: 'Remover este exercício?',
                  description: `"${exercise.exercise.name}" sai deste rascunho. A versão publicada não muda.`,
                  confirmLabel: 'Remover exercício',
                  action: () => run(() => api.deleteWorkoutExercise(ids.clientId, ids.workoutId, ids.versionId, day.id, exercise.id)),
                })
              }
              onSaveSet={(set, input) =>
                run(() => api.updateWorkoutSet(ids.clientId, ids.workoutId, ids.versionId, day.id, exercise.id, set.id, input))
              }
              onRemoveSet={(set) => run(() => api.deleteWorkoutSet(ids.clientId, ids.workoutId, ids.versionId, day.id, exercise.id, set.id))}
              onAddSet={() => {
                // Nova série copia a prescrição da última (o profissional ajusta depois).
                const last = exercise.sets[exercise.sets.length - 1];
                return run(() =>
                  api.addWorkoutSet(ids.clientId, ids.workoutId, ids.versionId, day.id, exercise.id, {
                    reps: last?.reps ?? null,
                    repsMin: last?.repsMin ?? null,
                    repsMax: last?.repsMax ?? null,
                    loadValue: last?.loadValue ?? null,
                    loadUnit: last?.loadUnit ?? null,
                    restSeconds: last?.restSeconds ?? null,
                  }),
                );
              }}
              onInvalid={setError}
            />
          )}
        />
      ))}

      <NewDayForm onCreate={(name) => run(() => api.createWorkoutDay(ids.clientId, ids.workoutId, ids.versionId, { name }))} />

      {catalog ? (
        <CatalogExerciseModal
          title={catalog.kind === 'add' ? 'Adicionar exercício' : `Trocar "${catalog.name}"`}
          confirmLabel={catalog.kind === 'add' ? 'Adicionar' : 'Trocar exercício'}
          error={catalogError}
          onClose={() => setCatalog(null)}
          onConfirm={pickFromCatalog}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          danger
          onConfirm={confirm.action}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}

function DayEditor({
  day,
  canMoveUp,
  canMoveDown,
  onMove,
  onSaveDay,
  onRemoveDay,
  onAddExercise,
  renderExercise,
}: {
  day: WorkoutDay;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onSaveDay: (input: { name: string; notes: string }) => Promise<boolean>;
  onRemoveDay: () => void;
  onAddExercise: () => void;
  renderExercise: (exercise: WorkoutExercise, index: number) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(day.name);
  const [notes, setNotes] = useState(day.notes ?? '');

  return (
    <section aria-label={`Dia do treino: ${day.name}`}>
      <Card title={day.name}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="small" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Fechar' : 'Editar dia'}
          </Button>
          <Button size="small" variant="ghost" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label={`Subir dia ${day.name}`}>
            ↑
          </Button>
          <Button size="small" variant="ghost" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label={`Descer dia ${day.name}`}>
            ↓
          </Button>
          <Button size="small" variant="danger" onClick={onRemoveDay}>
            Remover dia
          </Button>
        </div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TextField label="Nome do dia" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Observações do dia" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div>
              <Button
                size="small"
                disabled={!name.trim()}
                onClick={async () => {
                  if (await onSaveDay({ name: name.trim(), notes: notes.trim() })) setEditing(false);
                }}
              >
                Salvar dia
              </Button>
            </div>
          </div>
        ) : day.notes ? (
          <div style={{ fontSize: 12, fontStyle: 'italic' }}>{day.notes}</div>
        ) : null}

        {day.exercises.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum exercício ainda.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{day.exercises.map((exercise, index) => renderExercise(exercise, index))}</div>
        )}
        <div>
          <Button size="small" variant="ghost" onClick={onAddExercise}>
            + Exercício
          </Button>
        </div>
      </Card>
    </section>
  );
}

function ExerciseEditor({
  exercise,
  canMoveUp,
  canMoveDown,
  onMove,
  onSaveNotes,
  onReplace,
  onRemove,
  onSaveSet,
  onRemoveSet,
  onAddSet,
  onInvalid,
}: {
  exercise: WorkoutExercise;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
  onReplace: () => void;
  onRemove: () => void;
  onSaveSet: (set: WorkoutSet, input: api.WorkoutSetInput) => Promise<boolean>;
  onRemoveSet: (set: WorkoutSet) => void;
  onAddSet: () => void;
  onInvalid: (message: string) => void;
}) {
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const name = exercise.exercise.name;
  const notesChanged = notes.trim() !== (exercise.notes ?? '');

  return (
    <div
      aria-label={`Exercício do treino: ${name}`}
      style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}
    >
      <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</span>
          <Button size="small" variant="ghost" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label={`Subir ${name}`}>
            ↑
          </Button>
          <Button size="small" variant="ghost" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label={`Descer ${name}`}>
            ↓
          </Button>
          <Button size="small" variant="ghost" onClick={onReplace}>
            Trocar exercício
          </Button>
          <Button size="small" variant="danger" onClick={onRemove}>
            Remover
          </Button>
        </div>

        {summarizeSets(exercise.sets).map((line) => (
          <div key={line} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {line}
          </div>
        ))}
        {exercise.sets.map((set, index) => (
          <SetRow key={set.id} index={index} set={set} onSave={(input) => onSaveSet(set, input)} onRemove={() => onRemoveSet(set)} onInvalid={onInvalid} />
        ))}
        <div>
          <Button size="small" variant="ghost" onClick={onAddSet}>
            + Série
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <TextField label="Observações / técnica" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {notesChanged ? (
            <Button size="small" onClick={() => onSaveNotes(notes.trim())}>
              Salvar observação
            </Button>
          ) : null}
        </div>
      </div>
      <ExerciseGif exercise={exercise.exercise} />
    </div>
  );
}

function SetRow({
  index,
  set,
  onSave,
  onRemove,
  onInvalid,
}: {
  index: number;
  set: WorkoutSet;
  onSave: (input: api.WorkoutSetInput) => Promise<boolean>;
  onRemove: () => void;
  onInvalid: (message: string) => void;
}) {
  const initial = setToForm(set);
  const [form, setForm] = useState<SetForm>(initial);
  const changed = form.reps !== initial.reps || form.load !== initial.load || form.rest !== initial.rest;
  const field = (key: keyof SetForm) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div role="group" aria-label={`Série ${index + 1}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, width: 52, paddingBottom: 10 }}>Série {index + 1}</span>
      <div style={{ width: 90 }}>
        <TextField label="Repetições" placeholder="12 ou 8-12" value={form.reps} onChange={field('reps')} />
      </div>
      <div style={{ width: 80 }}>
        <TextField label="Carga (kg)" inputMode="decimal" value={form.load} onChange={field('load')} />
      </div>
      <div style={{ width: 90 }}>
        <TextField label="Descanso (s)" inputMode="numeric" value={form.rest} onChange={field('rest')} />
      </div>
      {changed ? (
        <Button
          size="small"
          onClick={() => {
            const input = formToSetInput(form, set.loadUnit);
            if (isSetInputError(input)) {
              onInvalid(input.error);
              return;
            }
            void onSave(input);
          }}
        >
          Salvar série
        </Button>
      ) : null}
      <Button size="small" variant="ghost" onClick={onRemove} aria-label={`Remover série ${index + 1}`}>
        ✕
      </Button>
    </div>
  );
}

function NewDayForm({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <TextField label="Novo dia de treino" placeholder="Ex.: Dia A — Peito e tríceps" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          loading={saving}
          onClick={async () => {
            if (!name.trim()) return;
            setSaving(true);
            const ok = await onCreate(name.trim());
            setSaving(false);
            if (ok) setName('');
          }}
        >
          Adicionar
        </Button>
      </div>
    </Card>
  );
}
