import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { Modal } from '../../components/Modal';
import { formatDate } from '../../lib/format';

export function WorkoutTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [showAddExercise, setShowAddExercise] = useState<string | null>(null);

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
        action={<Button onClick={() => createWorkoutMutation.mutate()} loading={createWorkoutMutation.isPending}>Criar treino</Button>}
      />
    );
  }

  const version = workout.currentVersion;
  const isDraft = version?.status === 'draft';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Treino — versão {version?.versionNumber}</h2>
          {version ? <StatusBadge status={version.status} /> : null}
        </div>
        {isDraft ? (
          <Button onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}>
            Publicar versão
          </Button>
        ) : null}
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
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{ex.sets.length} série(s) prescrita(s)</div>
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
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <option value="">Selecione…</option>
          {(exercises ?? []).map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
