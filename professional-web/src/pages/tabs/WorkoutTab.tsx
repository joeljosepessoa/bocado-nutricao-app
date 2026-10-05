import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { ExerciseGif } from '../../components/ExerciseGif';
import { formatDate } from '../../lib/format';
import { summarizeSets } from '../../lib/workoutFormat';
import type { WorkoutVersion } from '../../types/api';
import { WorkoutVersionEditor } from '../../workoutEditor/WorkoutVersionEditor';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

export function WorkoutTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const createdByAssistant = (location.state as { assistantCreated?: boolean } | null)?.assistantCreated === true;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const openAssistant = () => navigate(`/clients/${clientId}/workout/assistant`);

  const { data: workoutList, isLoading: loadingList } = useQuery({
    queryKey: ['workouts', clientId],
    queryFn: () => api.listWorkouts(clientId!),
  });
  // Treino excluído (arquivado) não aparece: o painel trabalha só com o treino ativo.
  const workoutId = workoutList?.items.find((w) => w.status === 'active')?.id;

  const { data: workout, isLoading: loadingWorkout } = useQuery({
    queryKey: ['workout', clientId, workoutId],
    queryFn: () => api.getWorkout(clientId!, workoutId!),
    enabled: !!workoutId,
  });

  // A API devolve como "atual" a versão publicada; um rascunho aberto ao lado dela é buscado à parte.
  const current = workout?.currentVersion ?? null;
  const draftSummary = workout?.versions.find((v) => v.status === 'draft');
  const draftIsCurrent = !!draftSummary && current?.id === draftSummary.id;
  const { data: separateDraft, isLoading: loadingDraft } = useQuery({
    queryKey: ['workout-version', clientId, workoutId, draftSummary?.id],
    queryFn: () => api.getWorkoutVersion(clientId!, workoutId!, draftSummary!.id),
    enabled: !!draftSummary && !draftIsCurrent,
  });
  const draft: WorkoutVersion | null = draftSummary ? (draftIsCurrent ? current : (separateDraft ?? null)) : null;
  const published = current?.status === 'published' ? current : null;

  const { data: logs } = useQuery({
    queryKey: ['execution-logs', clientId, workoutId],
    queryFn: () => api.listExecutionLogs(clientId!, workoutId!),
    enabled: !!workoutId,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workout', clientId, workoutId] }),
      queryClient.invalidateQueries({ queryKey: ['workout-version', clientId, workoutId] }),
      queryClient.invalidateQueries({ queryKey: ['workouts', clientId] }),
    ]);

  const createWorkoutMutation = useMutation({
    mutationFn: () => api.createWorkout(clientId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workouts', clientId] }),
  });

  // Editar treino publicado = abrir uma NOVA versão em rascunho (cópia da publicada); a publicada fica intacta.
  const editMutation = useMutation({
    mutationFn: () => api.createWorkoutVersion(clientId!, workoutId!),
    onMutate: () => setActionError(null),
    onSuccess: refresh,
    onError: (err) => setActionError(errorMessage(err, 'Não foi possível abrir a edição do treino.')),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.publishWorkoutVersion(clientId!, workoutId!, draft!.id),
    onMutate: () => setActionError(null),
    onSuccess: refresh,
    onError: (err) => setActionError(errorMessage(err, 'Não foi possível publicar a versão.')),
  });

  async function deleteWorkout() {
    setActionError(null);
    try {
      await api.archiveWorkout(clientId!, workoutId!);
      queryClient.removeQueries({ queryKey: ['workout', clientId, workoutId] });
      queryClient.removeQueries({ queryKey: ['workout-version', clientId, workoutId] });
      queryClient.removeQueries({ queryKey: ['execution-logs', clientId, workoutId] });
      await queryClient.invalidateQueries({ queryKey: ['workouts', clientId] });
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível excluir o treino.'));
    }
  }

  if (loadingList || (workoutId && loadingWorkout) || (draftSummary && !draftIsCurrent && loadingDraft)) {
    return <EmptyState title="Carregando treino…" />;
  }

  if (!workoutId || !workout) {
    return (
      <EmptyState
        title="Nenhum treino cadastrado"
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

  const shown = draft ?? published;

  return (
    <>
      {createdByAssistant && draft ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          Treino criado como rascunho pelo Assistente. Revise e publique quando quiser — nada foi enviado ao cliente.
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Treino — versão {shown?.versionNumber}</h2>
          {shown ? <StatusBadge status={shown.status} /> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={openAssistant}>
            🤖 Assistente de Treino
          </Button>
          {draft ? (
            <Button onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}>
              Publicar versão
            </Button>
          ) : (
            <Button onClick={() => editMutation.mutate()} loading={editMutation.isPending}>
              Editar treino
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Excluir treino
          </Button>
        </div>
      </div>

      {draft && published ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          Editando a versão {draft.versionNumber} (rascunho). A versão {published.versionNumber} publicada continua sendo a que a cliente
          vê até você publicar.
        </div>
      ) : null}

      {actionError ? (
        <div role="alert" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
          {actionError}
        </div>
      ) : null}

      {draft ? (
        <WorkoutVersionEditor clientId={clientId!} workoutId={workoutId} version={draft} onChanged={refresh} />
      ) : published ? (
        <PublishedVersion version={published} />
      ) : (
        <EmptyState title="Sem versão em edição" />
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

      {confirmDelete ? (
        <ConfirmDialog
          title="Excluir este treino?"
          description="Esta ação removerá o treino desta cliente. Os demais dados da cliente não serão alterados."
          confirmLabel="Excluir treino"
          danger
          onConfirm={deleteWorkout}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}

/** Versão publicada: só leitura — alterar passa por "Editar treino" (novo rascunho). */
function PublishedVersion({ version }: { version: WorkoutVersion }) {
  return (
    <>
      {version.days.map((day) => (
        <Card key={day.id} title={day.name}>
          {day.exercises.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum exercício ainda.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {day.exercises.map((ex) => (
                <div
                  key={ex.id}
                  aria-label={`Exercício do treino: ${ex.exercise.name}`}
                  style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ex.exercise.name}</div>
                    {summarizeSets(ex.sets).map((line) => (
                      <div key={line} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {line}
                      </div>
                    ))}
                    {ex.notes ? <div style={{ fontSize: 12, fontStyle: 'italic' }}>{ex.notes}</div> : null}
                  </div>
                  <ExerciseGif exercise={ex.exercise} />
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </>
  );
}
