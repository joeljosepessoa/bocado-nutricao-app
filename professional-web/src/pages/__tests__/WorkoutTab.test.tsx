import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { Workout, WorkoutSet } from '../../types/api';
import { WorkoutTab } from '../tabs/WorkoutTab';

vi.mock('../../api/endpoints', () => ({
  listWorkouts: vi.fn(),
  getWorkout: vi.fn(),
  listExecutionLogs: vi.fn(),
  fetchExerciseMedia: vi.fn(),
  listExercises: vi.fn(),
  createWorkout: vi.fn(),
  publishWorkoutVersion: vi.fn(),
  createWorkoutDay: vi.fn(),
  addWorkoutExercise: vi.fn(),
}));

const set = (order: number, overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s-${order}-${Math.random()}`,
  order,
  reps: null,
  repsMin: null,
  repsMax: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  ...overrides,
});

// Treino como volta da API depois de criado pelo Assistente (rascunho).
const savedDraft: Workout = {
  id: 'w1',
  clientId: 'c1',
  status: 'active',
  versions: [{ id: 'v1', versionNumber: 1, status: 'draft', publishedAt: null, supersededAt: null, createdAt: '2026-09-25T00:00:00Z' }],
  currentVersion: {
    id: 'v1',
    workoutId: 'w1',
    versionNumber: 1,
    status: 'draft',
    objective: null,
    notes: null,
    publishedAt: null,
    supersededAt: null,
    days: [
      {
        id: 'd1',
        name: 'SEGUNDA - PEITO + TRÍCEPS',
        order: 0,
        notes: null,
        exercises: [
          {
            id: 'we1',
            order: 0,
            notes: null,
            exercise: { id: 'ex-supino', name: 'Supino reto com barra', muscleGroup: 'Peito', equipment: 'Barra', imageUrl: '/exercise-media/supino' },
            sets: [0, 1, 2, 3].map((o) => set(o, { repsMin: 6, repsMax: 10, restSeconds: 90 })),
          },
          {
            id: 'we2',
            order: 1,
            notes: null,
            exercise: { id: 'ex-sem-gif', name: 'Prancha', muscleGroup: 'Core', equipment: null, imageUrl: null },
            sets: [set(0, { durationSeconds: 30 })],
          },
        ],
      },
    ],
  },
};

const blobSource = new WeakMap<Blob, string>();

describe('WorkoutTab — treino salvo pelo Assistente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkouts).mockResolvedValue({ items: [{ id: 'w1', status: 'active', createdAt: '2026-09-25T00:00:00Z' }], total: 1, page: 1, pageSize: 20 });
    vi.mocked(api.getWorkout).mockResolvedValue(savedDraft);
    vi.mocked(api.listExecutionLogs).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    vi.mocked(api.fetchExerciseMedia).mockImplementation(async (path: string) => {
      const blob = new Blob([path], { type: 'image/gif' });
      blobSource.set(blob, path);
      return blob;
    });
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blobSource.get(blob)}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  function renderTab() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: '/clients/c1/workout', state: { assistantCreated: true } }]}>
          <Routes>
            <Route path="/clients/:clientId/workout" element={<WorkoutTab />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('ao reabrir, cada exercício carrega o GIF do próprio exercício do catálogo; sem GIF, avisa', async () => {
    renderTab();

    const supino = await screen.findByLabelText('Exercício do treino: Supino reto com barra');
    const img = await within(supino).findByRole('img', { name: 'Demonstração: Supino reto com barra' });
    expect(img).toHaveAttribute('src', 'blob:/exercise-media/supino');
    expect(api.fetchExerciseMedia).toHaveBeenCalledWith('/exercise-media/supino');
    expect(within(supino).getByText('4 × 6–10 reps · descanso 1min30')).toBeInTheDocument();

    const prancha = screen.getByLabelText('Exercício do treino: Prancha');
    expect(within(prancha).getByText('GIF não disponível para este exercício.')).toBeInTheDocument();
    expect(within(prancha).queryByRole('img')).not.toBeInTheDocument();
    expect(api.fetchExerciseMedia).toHaveBeenCalledTimes(1);
  });

  it('continua rascunho e nada é publicado ao abrir', async () => {
    renderTab();
    expect(await screen.findByText(/Treino criado como rascunho pelo Assistente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar versão' })).toBeInTheDocument();
    expect(api.publishWorkoutVersion).not.toHaveBeenCalled();
  });
});
