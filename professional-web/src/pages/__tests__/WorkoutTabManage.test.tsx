import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { Exercise, Workout, WorkoutSet, WorkoutVersion } from '../../types/api';
import { WorkoutTab } from '../tabs/WorkoutTab';

vi.mock('../../api/endpoints', () => ({
  listWorkouts: vi.fn(),
  getWorkout: vi.fn(),
  getWorkoutVersion: vi.fn(),
  listExecutionLogs: vi.fn(),
  fetchExerciseMedia: vi.fn(),
  listExercises: vi.fn(),
  createWorkout: vi.fn(),
  createWorkoutVersion: vi.fn(),
  publishWorkoutVersion: vi.fn(),
  archiveWorkout: vi.fn(),
  createWorkoutDay: vi.fn(),
  updateWorkoutDay: vi.fn(),
  deleteWorkoutDay: vi.fn(),
  reorderWorkoutDays: vi.fn(),
  addWorkoutExercise: vi.fn(),
  updateWorkoutExercise: vi.fn(),
  deleteWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  addWorkoutSet: vi.fn(),
  updateWorkoutSet: vi.fn(),
  deleteWorkoutSet: vi.fn(),
}));

const set = (id: string, overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id,
  order: 0,
  reps: 10,
  repsMin: null,
  repsMax: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: 60,
  tempo: null,
  ...overrides,
});

const version = (id: string, versionNumber: number, status: WorkoutVersion['status']): WorkoutVersion => ({
  id,
  workoutId: 'w1',
  versionNumber,
  status,
  objective: null,
  notes: null,
  publishedAt: status === 'published' ? '2026-10-01T00:00:00Z' : null,
  supersededAt: null,
  days: [
    {
      id: `${id}-d1`,
      name: 'Dia A',
      order: 0,
      notes: null,
      exercises: [
        {
          id: `${id}-we1`,
          order: 0,
          notes: null,
          exercise: { id: 'ex-supino', name: 'Supino reto com barra', muscleGroup: 'Peito', equipment: 'Barra', imageUrl: null },
          sets: [set(`${id}-s1`)],
        },
        {
          id: `${id}-we2`,
          order: 1,
          notes: null,
          exercise: { id: 'ex-remada', name: 'Remada baixa', muscleGroup: 'Costas', equipment: 'Polia', imageUrl: null },
          sets: [set(`${id}-s2`, { reps: 12 })],
        },
      ],
    },
  ],
});

const summary = (id: string, versionNumber: number, status: WorkoutVersion['status']) => ({
  id,
  versionNumber,
  status,
  publishedAt: null,
  supersededAt: null,
  createdAt: '2026-10-01T00:00:00Z',
});

const publishedOnly: Workout = { id: 'w1', clientId: 'c1', status: 'active', versions: [summary('v1', 1, 'published')], currentVersion: version('v1', 1, 'published') };
const publishedWithDraft: Workout = {
  ...publishedOnly,
  versions: [summary('v2', 2, 'draft'), summary('v1', 1, 'published')],
};

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/clients/c1/workout']}>
        <Routes>
          <Route path="/clients/:clientId/workout" element={<WorkoutTab />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listWorkouts).mockResolvedValue({ items: [{ id: 'w1', status: 'active', createdAt: '2026-10-01T00:00:00Z' }], total: 1, page: 1, pageSize: 20 });
  vi.mocked(api.getWorkout).mockResolvedValue(publishedOnly);
  vi.mocked(api.getWorkoutVersion).mockResolvedValue(version('v2', 2, 'draft'));
  vi.mocked(api.listExecutionLogs).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

describe('WorkoutTab — editar treino', () => {
  it('treino publicado: mostra Editar e Excluir, só leitura até editar; Editar cria um rascunho e abre o editor sem tocar na publicada', async () => {
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByRole('heading', { name: 'Treino — versão 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir treino' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Exercício' })).not.toBeInTheDocument();

    vi.mocked(api.createWorkoutVersion).mockImplementation(async () => {
      vi.mocked(api.getWorkout).mockResolvedValue(publishedWithDraft);
      return version('v2', 2, 'draft');
    });
    await user.click(screen.getByRole('button', { name: 'Editar treino' }));

    expect(api.createWorkoutVersion).toHaveBeenCalledWith('c1', 'w1');
    expect(await screen.findByRole('heading', { name: 'Treino — versão 2' })).toBeInTheDocument();
    expect(screen.getByText(/A versão 1 publicada continua sendo a que a cliente vê/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar versão' })).toBeInTheDocument();
    expect(api.getWorkoutVersion).toHaveBeenCalledWith('c1', 'w1', 'v2');
    expect(api.publishWorkoutVersion).not.toHaveBeenCalled();
  });

  it('editor do rascunho: altera série (faixa + descanso), reordena, troca e remove exercício pela API, com confirmação', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getWorkout).mockResolvedValue(publishedWithDraft);
    vi.mocked(api.listExercises).mockResolvedValue([
      { id: 'ex-crucifixo', name: 'Crucifixo com halteres', type: 'strength', muscleGroup: 'Peito', equipment: 'Halteres', videoUrl: null, imageUrl: null, scope: 'global' } as Exercise,
    ]);
    renderTab();

    const supino = await screen.findByLabelText('Exercício do treino: Supino reto com barra');
    const serie = within(supino).getByRole('group', { name: 'Série 1' });
    await user.clear(within(serie).getByLabelText('Repetições'));
    await user.type(within(serie).getByLabelText('Repetições'), '8-12');
    await user.clear(within(serie).getByLabelText('Descanso (s)'));
    await user.type(within(serie).getByLabelText('Descanso (s)'), '90');
    await user.click(within(serie).getByRole('button', { name: 'Salvar série' }));
    expect(api.updateWorkoutSet).toHaveBeenCalledWith('c1', 'w1', 'v2', 'v2-d1', 'v2-we1', 'v2-s1', {
      reps: null,
      repsMin: 8,
      repsMax: 12,
      loadValue: null,
      loadUnit: null,
      restSeconds: 90,
    });

    await user.click(within(supino).getByRole('button', { name: 'Descer Supino reto com barra' }));
    expect(api.reorderWorkoutExercises).toHaveBeenCalledWith('c1', 'w1', 'v2', 'v2-d1', ['v2-we2', 'v2-we1']);

    // Trocar: só um exercício escolhido no catálogo (id vindo da API).
    await user.click(within(supino).getByRole('button', { name: 'Trocar exercício' }));
    const picker = await screen.findByRole('dialog');
    await user.click(await within(picker).findByRole('option', { name: /Crucifixo com halteres/ }));
    await user.click(within(picker).getByRole('button', { name: 'Trocar exercício' }));
    await waitFor(() =>
      expect(api.updateWorkoutExercise).toHaveBeenCalledWith('c1', 'w1', 'v2', 'v2-d1', 'v2-we1', { exerciseId: 'ex-crucifixo' }),
    );

    // Remover pede confirmação.
    const remada = screen.getByLabelText('Exercício do treino: Remada baixa');
    await user.click(within(remada).getByRole('button', { name: 'Remover' }));
    expect(api.deleteWorkoutExercise).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remover exercício' }));
    expect(api.deleteWorkoutExercise).toHaveBeenCalledWith('c1', 'w1', 'v2', 'v2-d1', 'v2-we2');
  });

  it('série inválida mostra a mensagem e não chama a API; erro da API aparece na tela', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getWorkout).mockResolvedValue(publishedWithDraft);
    renderTab();

    const supino = await screen.findByLabelText('Exercício do treino: Supino reto com barra');
    const serie = within(supino).getByRole('group', { name: 'Série 1' });
    await user.clear(within(serie).getByLabelText('Repetições'));
    await user.type(within(serie).getByLabelText('Repetições'), '12-8');
    await user.click(within(serie).getByRole('button', { name: 'Salvar série' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/mínimo não pode ser maior/);
    expect(api.updateWorkoutSet).not.toHaveBeenCalled();

    vi.mocked(api.deleteWorkoutSet).mockRejectedValueOnce({ response: { data: { message: 'Este exercício já tem execuções registradas.' } } });
    await user.click(within(serie).getByRole('button', { name: 'Remover série 1' }));
    expect(await screen.findByText('Este exercício já tem execuções registradas.')).toBeInTheDocument();
  });
});

describe('WorkoutTab — excluir treino', () => {
  it('pede confirmação clara; cancelar não exclui', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Excluir treino' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Excluir este treino?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Esta ação removerá o treino desta cliente. Os demais dados da cliente não serão alterados.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(api.archiveWorkout).not.toHaveBeenCalled();
  });

  it('após confirmar, a tela atualiza para "Nenhum treino cadastrado" com a ação de criar novo treino', async () => {
    const user = userEvent.setup();
    vi.mocked(api.archiveWorkout).mockImplementation(async () => {
      vi.mocked(api.listWorkouts).mockResolvedValue({ items: [{ id: 'w1', status: 'archived', createdAt: '2026-10-01T00:00:00Z' }], total: 1, page: 1, pageSize: 20 });
      return { ...publishedOnly, status: 'archived' };
    });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Excluir treino' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir treino' }));

    expect(api.archiveWorkout).toHaveBeenCalledWith('c1', 'w1');
    expect(await screen.findByText('Nenhum treino cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar treino' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro da API ao excluir aparece na tela e o treino continua visível', async () => {
    const user = userEvent.setup();
    vi.mocked(api.archiveWorkout).mockRejectedValueOnce({ response: { data: { message: 'Este treino já foi excluído.' } } });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Excluir treino' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir treino' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este treino já foi excluído.');
    expect(screen.getByRole('heading', { name: 'Treino — versão 1' })).toBeInTheDocument();
  });

  it('só treino arquivado na lista = nenhum treino cadastrado (não reabre o excluído)', async () => {
    vi.mocked(api.listWorkouts).mockResolvedValue({ items: [{ id: 'w1', status: 'archived', createdAt: '2026-10-01T00:00:00Z' }], total: 1, page: 1, pageSize: 20 });
    renderTab();
    expect(await screen.findByText('Nenhum treino cadastrado')).toBeInTheDocument();
    expect(api.getWorkout).not.toHaveBeenCalled();
  });
});
