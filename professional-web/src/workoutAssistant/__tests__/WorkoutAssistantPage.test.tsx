import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { OrganizedWorkoutProposal, ProposalSet } from '../../types/api';
import { WorkoutAssistantPage } from '../WorkoutAssistantPage';

vi.mock('../../api/endpoints', () => ({
  organizeWorkout: vi.fn(),
  createWorkoutFromProposal: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  listExercises: vi.fn(),
  fetchExerciseMedia: vi.fn(),
  publishWorkoutVersion: vi.fn(),
}));

const set = (overrides: Partial<ProposalSet> = {}): ProposalSet => ({
  reps: null,
  repsMin: null,
  repsMax: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  notes: null,
  ...overrides,
});

const supino = { id: 'ex-supino', name: 'Supino reto com barra', muscleGroup: 'Peito', equipment: 'Barra', imageUrl: '/exercise-media/abc' };
const tricepsA = { id: 'ex-tri-a', name: 'Tríceps pulley', muscleGroup: 'Tríceps', equipment: 'Corda', imageUrl: null };
const tricepsB = { id: 'ex-tri-b', name: 'Tríceps pulley', muscleGroup: 'Tríceps', equipment: 'Barra reta', imageUrl: null };
const crucifixo = { id: 'ex-cruc', name: 'Crucifixo inclinado', muscleGroup: 'Peito', equipment: 'Halteres', imageUrl: null, videoUrl: null, type: 'strength', scope: 'global' as const };

const proposal: OrganizedWorkoutProposal = {
  warnings: [],
  days: [
    {
      name: 'SEGUNDA - PEITO + TRÍCEPS',
      notes: null,
      warnings: [],
      exercises: [
        {
          rawName: 'Supino reto com barra',
          muscleGroupHint: 'Peito',
          notes: null,
          matchStatus: 'matched',
          matchedExercise: supino,
          candidates: [],
          sets: Array.from({ length: 4 }, () => set({ repsMin: 6, repsMax: 10, restSeconds: 90 })),
          warnings: ['Repetições apresentadas como intervalo.'],
        },
        {
          rawName: 'Tríceps pulley',
          muscleGroupHint: null,
          notes: null,
          matchStatus: 'ambiguous',
          matchedExercise: null,
          candidates: [tricepsA, tricepsB],
          sets: Array.from({ length: 3 }, () => set({ reps: 12 })),
          warnings: ['Nome do exercício possui mais de uma correspondência possível.', 'Descanso não informado.'],
        },
        {
          rawName: 'Crucifixo xyz',
          muscleGroupHint: null,
          notes: 'até a falha',
          matchStatus: 'not_found',
          matchedExercise: null,
          candidates: [],
          sets: [set({ reps: 10, restSeconds: 60 })],
          warnings: ['Exercício não encontrado no catálogo.', '"até a falha" não mapeado'],
        },
      ],
    },
  ],
};

const aiResult = {
  feature: 'organize_workout' as const,
  promptVersion: 'organize_workout@v1',
  provider: 'claude',
  model: 'claude-sonnet-5',
  text: '{}',
  structuredData: proposal,
  generatedAt: '2026-09-24T00:00:00Z',
  isAiGenerated: true as const,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/clients/c1/workout/assistant']}>
        <Routes>
          <Route path="/clients/:clientId/workout/assistant" element={<WorkoutAssistantPage />} />
          <Route path="/clients/:clientId/workout" element={<div>Aba treino</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function organizeProposal(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(api.organizeWorkout).mockResolvedValueOnce(aiResult);
  await user.type(screen.getByLabelText('Cole aqui o treino que você já possui'), 'Supino reto com barra 4x6-10 90s');
  await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
  await screen.findByDisplayValue('SEGUNDA - PEITO + TRÍCEPS');
}

const section = (name: RegExp) => screen.getByRole('region', { name });

describe('WorkoutAssistantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre o assistente no modo "Organizar treino existente" e só organiza com texto', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: /Assistente de Treino/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Organizar treino existente/ })).toHaveAttribute('aria-checked', 'true');
    const button = screen.getByRole('button', { name: 'Organizar com IA' });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText('Cole aqui o treino que você já possui'), 'Agachamento 3x10');
    expect(button).toBeEnabled();
  });

  it('cola o treino, gera a proposta e mostra o resultado estruturado com faixa, catálogo e avisos', async () => {
    const user = userEvent.setup();
    renderPage();
    await organizeProposal(user);

    expect(api.organizeWorkout).toHaveBeenCalledWith('c1', 'Supino reto com barra 4x6-10 90s');
    expect(screen.getByText(/Nada foi salvo ainda/)).toBeInTheDocument();

    const supinoCard = section(/Exercício 1: Supino reto com barra/);
    expect(within(supinoCard).getByText('✓ Encontrado no catálogo')).toBeInTheDocument();
    expect(within(supinoCard).getByText('GIF disponível')).toBeInTheDocument();
    expect(within(supinoCard).getAllByRole('group', { name: /Série \d/ })).toHaveLength(4);
    expect(within(supinoCard).getByLabelText('Série 1 — repetições mínimas')).toHaveValue(6);
    expect(within(supinoCard).getByLabelText('Série 1 — repetições máximas')).toHaveValue(10);
    expect(within(supinoCard).queryByLabelText('Série 1 — repetições')).not.toBeInTheDocument();

    const tricepsCard = section(/Exercício 2: Tríceps pulley/);
    expect(within(tricepsCard).getByText('⚠ Correspondência ambígua')).toBeInTheDocument();
    expect(within(tricepsCard).getByText(/Descanso não informado/)).toBeInTheDocument();

    const crucifixoCard = section(/Exercício 3: Crucifixo xyz/);
    expect(within(crucifixoCard).getByText(/Exercício não encontrado no catálogo/)).toBeInTheDocument();
    expect(within(crucifixoCard).getByText(/"até a falha" não mapeado/)).toBeInTheDocument();
    expect(within(crucifixoCard).getByLabelText('Observações do exercício 3')).toHaveValue('até a falha');
  });

  it('editar série resolve o aviso de descanso; remover e adicionar série funcionam', async () => {
    const user = userEvent.setup();
    renderPage();
    await organizeProposal(user);

    const tricepsCard = section(/Exercício 2: Tríceps pulley/);
    await user.type(within(tricepsCard).getByLabelText('Série 1 — descanso em segundos'), '60');
    expect(within(tricepsCard).getByLabelText('Série 1 — descanso em segundos')).toHaveValue(60);
    expect(within(tricepsCard).queryByText(/Descanso não informado/)).not.toBeInTheDocument();

    await user.click(within(tricepsCard).getByRole('button', { name: 'Remover série 3' }));
    expect(within(tricepsCard).getAllByRole('group', { name: /Série \d/ })).toHaveLength(2);
    await user.click(within(tricepsCard).getByRole('button', { name: '+ Adicionar série' }));
    expect(within(tricepsCard).getAllByRole('group', { name: /Série \d/ })).toHaveLength(3);
  });

  it('trocar faixa por repetições exatas não escolhe um número sozinho', async () => {
    const user = userEvent.setup();
    renderPage();
    await organizeProposal(user);

    const supinoCard = section(/Exercício 1: Supino reto com barra/);
    await user.selectOptions(within(supinoCard).getByLabelText('Série 1 — tipo de repetição'), 'exact');
    expect(within(supinoCard).getByLabelText('Série 1 — repetições')).toHaveValue(null);
  });

  it('resolve a ambiguidade escolhendo uma correspondência e troca exercício pelo catálogo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listExercises).mockResolvedValue([crucifixo]);
    renderPage();
    await organizeProposal(user);

    const tricepsCard = section(/Exercício 2: Tríceps pulley/);
    await user.click(within(tricepsCard).getByRole('button', { name: /Usar “Tríceps pulley” \(Tríceps · Barra reta\)/ }));
    expect(within(tricepsCard).getByText('✓ Selecionado por você')).toBeInTheDocument();
    expect(within(tricepsCard).queryByText(/mais de uma correspondência/)).not.toBeInTheDocument();

    await user.click(within(section(/Exercício 3: Crucifixo xyz/)).getByRole('button', { name: 'Selecionar do catálogo' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('option', { name: /Crucifixo inclinado/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Usar este exercício' }));

    const replaced = section(/Exercício 3: Crucifixo inclinado/);
    expect(within(replaced).getByText('Lido no texto: “Crucifixo xyz”')).toBeInTheDocument();
    expect(within(replaced).getByText('GIF não disponível para este exercício.')).toBeInTheDocument();
    expect(within(replaced).queryByText(/Exercício não encontrado no catálogo/)).not.toBeInTheDocument();
  });

  it('observação da IA pode ser marcada como revisada', async () => {
    const user = userEvent.setup();
    renderPage();
    await organizeProposal(user);

    const crucifixoCard = section(/Exercício 3: Crucifixo xyz/);
    await user.click(within(crucifixoCard).getByRole('button', { name: 'Marcar como revisado: "até a falha" não mapeado' }));
    expect(within(crucifixoCard).queryByText(/"até a falha" não mapeado/)).not.toBeInTheDocument();
  });

  it('não cria o rascunho enquanto houver exercício sem seleção do catálogo', async () => {
    const user = userEvent.setup();
    renderPage();
    await organizeProposal(user);

    await user.click(screen.getByRole('button', { name: 'Criar treino como rascunho' }));
    expect(await screen.findByText(/exercício 2 \("Tríceps pulley"\): selecione um exercício do catálogo/)).toBeInTheDocument();
    expect(screen.getByText(/exercício 3 \("Crucifixo xyz"\): selecione um exercício do catálogo/)).toBeInTheDocument();
    expect(api.createWorkoutFromProposal).not.toHaveBeenCalled();
  });

  it('cria o treino como rascunho com o payload revisado e NÃO publica', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createWorkoutFromProposal).mockResolvedValue({} as never);
    renderPage();
    await organizeProposal(user);

    await user.click(within(section(/Exercício 2: Tríceps pulley/)).getByRole('button', { name: /Usar “Tríceps pulley” \(Tríceps · Corda\)/ }));
    await user.click(within(section(/Exercício 3: Crucifixo xyz/)).getByRole('button', { name: 'Remover exercício' }));
    await user.click(within(section(/Exercício 2: Tríceps pulley/)).getByRole('button', { name: 'Mover exercício para cima' }));

    await user.click(screen.getByRole('button', { name: 'Criar treino como rascunho' }));
    expect(await screen.findByText('Aba treino')).toBeInTheDocument();

    expect(api.createWorkoutFromProposal).toHaveBeenCalledTimes(1);
    const [clientId, payload] = vi.mocked(api.createWorkoutFromProposal).mock.calls[0];
    expect(clientId).toBe('c1');
    expect(payload.days).toHaveLength(1);
    expect(payload.days[0].name).toBe('SEGUNDA - PEITO + TRÍCEPS');
    expect(payload.days[0].exercises.map((e) => e.exerciseId)).toEqual(['ex-tri-a', 'ex-supino']);
    expect(payload.days[0].exercises[0].sets).toHaveLength(3);
    expect(payload.days[0].exercises[0].sets[0]).toMatchObject({ reps: 12, repsMin: null, repsMax: null });
    expect(payload.days[0].exercises[1].sets).toHaveLength(4);
    expect(payload.days[0].exercises[1].sets[0]).toMatchObject({ reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 });
    expect(api.publishWorkoutVersion).not.toHaveBeenCalled();
  });

  it('sem consentimento do profissional: oferece ativar e tenta de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizeWorkout)
      .mockRejectedValueOnce({ response: { status: 403, data: { message: 'Você ainda não ativou as ferramentas de IA para sua conta.' } } })
      .mockResolvedValueOnce(aiResult);
    vi.mocked(api.acceptProfessionalAiConsent).mockResolvedValue();
    renderPage();

    await user.type(screen.getByLabelText('Cole aqui o treino que você já possui'), 'Supino 4x6-10');
    await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
    await user.click(await screen.findByRole('button', { name: 'Ativar assistente de IA para minha conta' }));

    expect(api.acceptProfessionalAiConsent).toHaveBeenCalled();
    expect(await screen.findByDisplayValue('SEGUNDA - PEITO + TRÍCEPS')).toBeInTheDocument();
  });

  it('erro da IA: mostra a mensagem e preserva o texto colado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizeWorkout).mockRejectedValueOnce({
      response: { status: 503, data: { message: 'A IA devolveu um formato inválido (não é JSON). Tente organizar novamente.' } },
    });
    renderPage();

    await user.type(screen.getByLabelText('Cole aqui o treino que você já possui'), 'Supino 4x6-10');
    await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));

    expect(await screen.findByText(/formato inválido/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cole aqui o treino que você já possui')).toHaveValue('Supino 4x6-10');
    expect(api.createWorkoutFromProposal).not.toHaveBeenCalled();
  });
});
