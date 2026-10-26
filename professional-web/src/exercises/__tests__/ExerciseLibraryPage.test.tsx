import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ExerciseLibraryItem, ExerciseLibraryPage as Page } from '../../types/api';
import { ExerciseLibraryPage } from '../ExerciseLibraryPage';
import { exerciseFromPreset } from '../../workoutAssistant/draft';
import { setsText } from '../presetText';

vi.mock('../../api/endpoints', () => ({
  listExerciseLibrary: vi.fn(),
  listExercisePresets: vi.fn(),
  createExercisePreset: vi.fn(),
  deleteExercisePreset: vi.fn(),
  updateExercise: vi.fn(),
  createExercise: vi.fn(),
  fetchExerciseMedia: vi.fn().mockResolvedValue(new Blob(['GIF89a'], { type: 'image/gif' })),
}));

const item = (over: Partial<ExerciseLibraryItem> = {}): ExerciseLibraryItem => ({
  id: 'e1',
  name: 'Remada Curvada com Kettlebell',
  muscleGroups: ['Costas'],
  equipment: 'Kettlebell',
  section: 'ACADEMIA / KETTLEBELL / COSTAS',
  scope: 'global',
  gifUrl: '/exercise-media/abc',
  canEdit: true,
  ...over,
});

const groups = ['Pernas', 'Abdômen', 'Peito', 'Costas', 'Cardio', 'Ombros', 'Alongamento', 'Mobilidade', 'Glúteos', 'Bíceps'].map((name, i) => ({ name, count: 1000 - i * 50 }));
const page = (over: Partial<Page> = {}): Page => ({
  items: [item(), item({ id: 'e2', name: '4 Cruzamentos em Pé', muscleGroups: [], equipment: null, gifUrl: null, canEdit: false })],
  total: 4972,
  page: 1,
  pageSize: 30,
  groups,
  withoutGroup: 599,
  equipments: [
    { name: 'Halteres', count: 428 },
    { name: 'Kettlebell', count: 184 },
  ],
  ...over,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ExerciseLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listExerciseLibrary).mockResolvedValue(page());
  vi.mocked(api.listExercisePresets).mockResolvedValue([]);
});

describe('Tela Exercícios', () => {
  it('mostra o total, os grupos com contagem (+N abre o resto) e cada exercício com grupos e sugestões de séries', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('4.972 exercícios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pernas (1.000)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bíceps/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+2' }));
    expect(screen.getByRole('button', { name: /Bíceps \(550\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sem grupos definidos (599)' })).toBeInTheDocument();

    expect(screen.getByText('Remada Curvada com Kettlebell')).toBeInTheDocument();
    expect(screen.getByText('Sem grupos definidos')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '4x 12 a 15 / 60" descanso' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: `3x 8 a 10 / 1'30" descanso` })).toHaveLength(2);
    // Sem GIF e sem permissão: nada de botão GIF nem Editar nessa linha.
    expect(screen.getAllByRole('button', { name: /Ver GIF/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
  });

  it('busca e filtros vão para o servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('4.972 exercícios');
    await user.type(screen.getByLabelText('Procurar exercício'), 'remada');
    await waitFor(() => expect(api.listExerciseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'remada', page: 1 })));
    await user.click(screen.getByRole('button', { name: /^Costas/ }));
    await waitFor(() => expect(api.listExerciseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ group: 'Costas' })));
    await user.selectOptions(screen.getByLabelText('Equipamento'), 'Kettlebell');
    await waitFor(() => expect(api.listExerciseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ equipment: 'Kettlebell' })));
  });

  it('"+ Preset" salva o exercício com a sugestão escolhida', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createExercisePreset).mockResolvedValue({} as never);
    renderPage();
    await screen.findByText('4.972 exercícios');
    await user.click(screen.getAllByRole('button', { name: '+ Preset' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: `3x 8 a 10 / 1'30" descanso` }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar preset' }));
    expect(api.createExercisePreset).toHaveBeenCalledWith({ exerciseId: 'e1', sets: 3, reps: null, repsMin: 8, repsMax: 10, restSeconds: 90 });
    expect(await screen.findByText(/Preset salvo: Remada Curvada com Kettlebell/)).toBeInTheDocument();
  });

  it('"Editar" muda nome, grupos (vários) e equipamento', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateExercise).mockResolvedValue({} as never);
    renderPage();
    await screen.findByText('4.972 exercícios');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ombros' }));
    await user.clear(within(dialog).getByLabelText('Equipamento'));
    await user.type(within(dialog).getByLabelText('Equipamento'), 'Halteres');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(api.updateExercise).toHaveBeenCalledWith('e1', { name: 'Remada Curvada com Kettlebell', muscleGroups: ['Costas', 'Ombros'], equipment: 'Halteres' });
  });

  it('o botão GIF abre a demonstração', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver GIF de Remada Curvada com Kettlebell' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(api.fetchExerciseMedia).toHaveBeenCalledWith('/exercise-media/abc'));
  });
});

describe('preset no treino', () => {
  it('vira exercício pronto: séries, faixa de repetições e descanso', () => {
    const preset = { sets: 4, reps: null, repsMin: 12, repsMax: 15, restSeconds: 60, exercise: { id: 'e1', name: 'Remada', muscleGroups: ['Costas'], equipment: 'Barra', imageUrl: '/m/1' } };
    const exercise = exerciseFromPreset(preset);
    expect(exercise.exercise).toMatchObject({ id: 'e1', name: 'Remada', muscleGroup: 'Costas', imageUrl: '/m/1' });
    expect(exercise.sets).toHaveLength(4);
    expect(exercise.sets[0]).toMatchObject({ repsMode: 'range', repsMin: 12, repsMax: 15, reps: null, restSeconds: 60 });
    expect(setsText(preset)).toBe('4x 12 a 15 / 60" descanso');
    expect(setsText({ sets: 3, reps: 10, repsMin: null, repsMax: null, restSeconds: 120 })).toBe(`3x 10 / 2' descanso`);
  });
});
