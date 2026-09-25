import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { Modal } from '../../components/Modal';
import { ExercisePreview } from '../../components/ExercisePreview';
import { describeExercise } from '../../lib/exerciseMedia';
import { formatDate } from '../../lib/format';
import { summarizeSets } from '../../lib/workoutFormat';

export function WorkoutTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const createdByAssistant = (location.state as { assistantCreated?: boolean } | null)?.assistantCreated === true;
  const queryClient = useQueryClient();
  const [showAddExercise, setShowAddExercise] = useState<string | null>(null);
  const openAssistant = () => navigate(`/clients/${clientId}/workout/assistant`);

  const { data: workoutList, isLoading: loadingList } = useQuery({
    queryKey: ['workouts', clientId],
    queryFn: () => api.listWorkouts(clientId!),
  });
  const workoutId = workoutList?.items[0]?.id;

  const { data: workout, isLoading: loadingWorkout } = useQuery({
    queryKey: ['workout', clientId, workoutId],
    queryFn: () => api.getWorkout(clientId!, workoutId!),
    enabled: !!workoutId,
  });

  const { data: logs } = useQuery({
    queryKey: ['execution-logs', clientId, workoutId],
    queryFn: () => api.listExecutionLogs(clientId!, workoutId!),
    enabled: !!workoutId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workout', clientId, workoutId] });
    queryClient.invalidateQueries({ queryKey: ['workouts', clientId] });
  };

  const createWorkoutMutation = useMutation({
    mutationFn: () => api.createWorkout(clientId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workouts', clientId] }),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.publishWorkoutVersion(clientId!, workoutId!, workout!.currentVersion!.id),
    onSuccess: invalidate,
  });

  const createDayMutation = useMutation({
    mutationFn: (name: string) => api.createWorkoutDay(clientId!, workoutId!, workout!.currentVersion!.id, { name }),
    onSuccess: invalidate,
  });

  if (loadingList || (workoutId && loadingWorkout)) {
    return <EmptyState title="Carregando treino…" />;
  }

  if (!workoutId || !workout) {
    return (
      <EmptyState
        title="Nenhum treino criado ainda"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button onClick={() => createWorkoutMutation.mutate()} loading={createWorkoutMutation.isPending}>
              Criar treino
            </Button>
            <Button variant="secondary" onClick={openAssistant}>
              🤖 Assistente de Treino
            </Button>
          </div>
        }
      />
    );
  }

  const version = workout.currentVersion;
  const isDraft = version?.status === 'draft';

  return (
    <>
      {createdByAssistant && isDraft ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          Treino criado como rascunho pelo Assistente. Revise e publique quando quiser — nada foi enviado ao cliente.
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Treino — versão {version?.versionNumber}</h2>
          {version ? <StatusBadge status={version.status} /> : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={openAssistant}>
            🤖 Assistente de Treino
          </Button>
          {isDraft ? (
            <Button onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}>
              Publicar versão
            </Button>
          ) : null}
        </div>
      </div>

      {!version ? (
        <EmptyState title="Sem versão em edição" />
      ) : (
        <>
          {version.days.map((day) => (
            <Card key={day.id} title={day.name}>
              {day.exercises.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum exercício ainda.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {day.exercises.map((ex) => (
                    <div key={ex.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ex.exercise.name}</div>
                      {summarizeSets(ex.sets).map((line) => (
                        <div key={line} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {line}
                        </div>
                      ))}
                      {ex.notes ? <div style={{ fontSize: 12, fontStyle: 'italic' }}>{ex.notes}</div> : null}
                    </div>
                  ))}
                </div>
              )}
              {isDraft ? (
                <Button size="small" variant="ghost" onClick={() => setShowAddExercise(day.id)}>
                  + Exercício
                </Button>
              ) : null}
            </Card>
          ))}

          {isDraft ? <NewDayForm onCreate={(name) => createDayMutation.mutate(name)} loading={createDayMutation.isPending} /> : null}
        </>
      )}

      <Card title="Histórico de execução">
        {!logs || logs.items.length === 0 ? (
          <EmptyState title="Nenhuma execução registrada ainda" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {logs.items.map((log) => (
              <div key={log.id} style={{ fontSize: 13, borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                {formatDate(log.performedAt)} {log.loggedByProfessionalId ? '· registrado pelo profissional' : '· registrado pelo cliente'}
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAddExercise ? (
        <AddExerciseModal
          clientId={clientId!}
          workoutId={workoutId}
          versionId={version!.id}
          dayId={showAddExercise}
          onClose={() => setShowAddExercise(null)}
          onAdded={invalidate}
        />
      ) : null}
    </>
  );
}

function NewDayForm({ onCreate, loading }: { onCreate: (name: string) => void; loading: boolean }) {
  const [name, setName] = useState('');
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <TextField label="Novo dia de treino" placeholder="Ex.: Dia A — Peito e tríceps" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            if (name.trim()) {
              onCreate(name.trim());
              setName('');
            }
          }}
          loading={loading}
        >
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function AddExerciseModal({
  clientId,
  workoutId,
  versionId,
  dayId,
  onClose,
  onAdded,
}: {
  clientId: string;
  workoutId: string;
  versionId: string;
  dayId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [exerciseId, setExerciseId] = useState('');

  const { data: exercises } = useQuery({ queryKey: ['exercises', search], queryFn: () => api.listExercises(search || undefined) });
  const selectedExercise = (exercises ?? []).find((ex) => ex.id === exerciseId);

  const mutation = useMutation({
    mutationFn: () => api.addWorkoutExercise(clientId, workoutId, versionId, dayId, { exerciseId }),
    onSuccess: () => {
      onAdded();
      onClose();
    },
  });

  return (
    <Modal
      title="Adicionar exercício"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!exerciseId}>
            Adicionar
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
          {(exercises ?? []).length === 0 ? (
            <div style={{ padding: 12, fontSize: 13 }}>Nenhum exercício encontrado.</div>
          ) : null}
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
      </div>
    </Modal>
  );
}
