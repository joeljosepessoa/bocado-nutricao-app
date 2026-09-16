import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api/endpoints';
import type { AdminModerationExercise, AdminModerationFood } from '../../types/api';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { formatDate } from '../../lib/format';

type Tab = 'foods' | 'exercises';

function isConflict(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 409;
}

export function AdminModerationPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('foods');
  const [rejectError, setRejectError] = useState<string | null>(null);

  const foodsQuery = useQuery({ queryKey: ['admin', 'moderation', 'foods'], queryFn: api.listPendingFoods });
  const exercisesQuery = useQuery({ queryKey: ['admin', 'moderation', 'exercises'], queryFn: api.listPendingExercises });

  const approveFoodMutation = useMutation({
    mutationFn: (id: string) => api.approveFood(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'foods'] }),
  });
  const rejectFoodMutation = useMutation({
    mutationFn: (id: string) => api.rejectFood(id),
    onSuccess: () => {
      setRejectError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'foods'] });
    },
    onError: (err) => {
      setRejectError(
        isConflict(err)
          ? 'Este alimento já está em uso em uma ou mais dietas e não pode ser excluído.'
          : 'Não foi possível rejeitar este alimento.',
      );
    },
  });

  const approveExerciseMutation = useMutation({
    mutationFn: (id: string) => api.approveExercise(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'exercises'] }),
  });
  const rejectExerciseMutation = useMutation({
    mutationFn: (id: string) => api.rejectExercise(id),
    onSuccess: () => {
      setRejectError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'exercises'] });
    },
    onError: (err) => {
      setRejectError(
        isConflict(err)
          ? 'Este exercício já está em uso em um ou mais treinos e não pode ser excluído.'
          : 'Não foi possível rejeitar este exercício.',
      );
    },
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Moderação de conteúdo global</h1>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant={tab === 'foods' ? 'primary' : 'ghost'} size="small" onClick={() => setTab('foods')}>
          Alimentos ({foodsQuery.data?.length ?? 0})
        </Button>
        <Button variant={tab === 'exercises' ? 'primary' : 'ghost'} size="small" onClick={() => setTab('exercises')}>
          Exercícios ({exercisesQuery.data?.length ?? 0})
        </Button>
      </div>

      {rejectError ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{rejectError}</div> : null}

      {tab === 'foods' ? (
        <DataTable<AdminModerationFood>
          loading={foodsQuery.isLoading}
          rows={foodsQuery.data ?? []}
          rowKey={(row) => row.id}
          emptyTitle="Nenhum alimento pendente"
          emptyDescription="Todo conteúdo global novo aparece aqui até ser aprovado ou rejeitado."
          columns={[
            { key: 'name', label: 'Nome', render: (row) => row.name },
            { key: 'kcal', label: 'kcal/100', render: (row) => row.kcalPer100 },
            { key: 'source', label: 'Origem', render: (row) => row.source },
            { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt) },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    loading={approveFoodMutation.isPending && approveFoodMutation.variables === row.id}
                    onClick={() => approveFoodMutation.mutate(row.id)}
                  >
                    Aprovar
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    loading={rejectFoodMutation.isPending && rejectFoodMutation.variables === row.id}
                    onClick={() => rejectFoodMutation.mutate(row.id)}
                  >
                    Rejeitar
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <DataTable<AdminModerationExercise>
          loading={exercisesQuery.isLoading}
          rows={exercisesQuery.data ?? []}
          rowKey={(row) => row.id}
          emptyTitle="Nenhum exercício pendente"
          emptyDescription="Todo conteúdo global novo aparece aqui até ser aprovado ou rejeitado."
          columns={[
            { key: 'name', label: 'Nome', render: (row) => row.name },
            { key: 'type', label: 'Tipo', render: (row) => row.type },
            { key: 'muscleGroup', label: 'Grupo muscular', render: (row) => row.muscleGroup ?? '—' },
            { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt) },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    loading={approveExerciseMutation.isPending && approveExerciseMutation.variables === row.id}
                    onClick={() => approveExerciseMutation.mutate(row.id)}
                  >
                    Aprovar
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    loading={rejectExerciseMutation.isPending && rejectExerciseMutation.variables === row.id}
                    onClick={() => rejectExerciseMutation.mutate(row.id)}
                  >
                    Rejeitar
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
