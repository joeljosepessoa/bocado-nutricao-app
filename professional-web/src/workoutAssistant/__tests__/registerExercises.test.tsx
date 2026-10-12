import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { CatalogExerciseRef, Exercise, OrganizedWorkoutProposal, ProposalExercise } from '../../types/api';
import { draftProblems, draftToPayload, proposalToDraft, type WorkoutDraft } from '../draft';
import { distinctNames, pendingExercises, pendingWithoutSuggestions } from '../registerExercises';
import { WorkoutProposalEditor } from '../WorkoutProposalEditor';

vi.mock('../../api/endpoints', () => ({
  listExercises: vi.fn(),
  createExercise: vi.fn(),
  fetchExerciseMedia: vi.fn(),
}));

const ref = (id: string, name: string): CatalogExerciseRef => ({ id, name, muscleGroup: 'Glúteos', equipment: null, imageUrl: null });
const set = { reps: 12, repsMin: null, repsMax: null, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, restSeconds: 60, tempo: null, notes: null };
const read = (rawName: string, extra: Partial<ProposalExercise> = {}): ProposalExercise => ({
  rawName,
  muscleGroupHint: null,
  notes: null,
  matchStatus: 'not_found',
  matchedExercise: null,
  candidates: [],
  sets: [set, set, set],
  warnings: [],
  ...extra,
});

/** O caso real: dia de glúteo com 6 exercícios, 5 deles fora do catálogo (que só tinha o "Stiff"). */
const proposal: OrganizedWorkoutProposal = {
  warnings: [],
  days: [
    {
      name: 'GLÚTEO E POSTERIOR',
      notes: null,
      warnings: [],
      exercises: [
        read('Cadeira abdutora'),
        read('Stiff', { matchStatus: 'matched', matchedExercise: ref('ex-stiff', 'Stiff') }),
        read('Coice na polia'),
        read('Agachamento búlgaro (Smith ou livre)'),
        read('Elevação pélvica', { candidates: [ref('ex-pelvica-barra', 'Elevação pélvica com barra')] }),
        read('Agachamento sumô', { muscleGroupHint: 'Glúteos' }),
      ],
    },
    { name: 'GLÚTEO B', notes: null, warnings: [], exercises: [read('cadeira  abdutora')] },
  ],
};

const asExercise = (id: string, name: string, muscleGroup: string | null = null): Exercise => ({
  id,
  name,
  type: 'strength',
  muscleGroup,
  equipment: null,
  videoUrl: null,
  imageUrl: null,
  scope: 'private',
});

function Harness({ onDraft }: { onDraft: (draft: WorkoutDraft) => void }) {
  const [draft, setDraft] = useState(() => proposalToDraft(proposal));
  onDraft(draft);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorkoutProposalEditor draft={draft} onChange={setDraft} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listExercises).mockResolvedValue([]);
  let sequence = 0;
  vi.mocked(api.createExercise).mockImplementation(async (input) => asExercise(`novo-${++sequence}`, input.name, input.muscleGroup ?? null));
});

describe('exercícios do texto que não estão no catálogo', () => {
  it('entram no cadastro em lote só os sem sugestão; nome repetido conta uma vez', () => {
    const draft = proposalToDraft(proposal);
    expect(pendingExercises(draft).map((p) => p.name)).toEqual([
      'Cadeira abdutora',
      'Coice na polia',
      'Agachamento búlgaro (Smith ou livre)',
      'Elevação pélvica',
      'Agachamento sumô',
      'cadeira abdutora',
    ]);
    // "Elevação pélvica" tem algo parecido no catálogo: fica para o profissional decidir.
    expect(distinctNames(pendingWithoutSuggestions(draft))).toEqual(['Cadeira abdutora', 'Coice na polia', 'Agachamento búlgaro (Smith ou livre)', 'Agachamento sumô']);
  });

  it('um clique cadastra todos no catálogo particular (sem GIF) e liga ao treino; o que tem sugestão continua pendente', async () => {
    const user = userEvent.setup();
    let latest: WorkoutDraft | null = null;
    render(<Harness onDraft={(draft) => (latest = draft)} />);

    const banner = screen.getByRole('region', { name: 'Exercícios que não estão no catálogo' });
    expect(banner).toHaveTextContent('4 exercícios do seu texto não estão no catálogo: Cadeira abdutora, Coice na polia, Agachamento búlgaro (Smith ou livre), Agachamento sumô.');
    await user.click(within(banner).getByRole('button', { name: 'Cadastrar os 4 no meu catálogo' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Exercícios que não estão no catálogo' })).not.toBeInTheDocument());
    // Um cadastro por nome — "cadeira  abdutora" do segundo dia reaproveita o do primeiro.
    expect(vi.mocked(api.createExercise).mock.calls.map(([input]) => input)).toEqual([
      { name: 'Cadeira abdutora', type: 'strength', scope: 'private' },
      { name: 'Coice na polia', type: 'strength', scope: 'private' },
      { name: 'Agachamento búlgaro (Smith ou livre)', type: 'strength', scope: 'private' },
      { name: 'Agachamento sumô', type: 'strength', scope: 'private', muscleGroup: 'Glúteos' },
    ]);

    const draft = latest as unknown as WorkoutDraft;
    expect(draft.days[0].exercises.map((e) => [e.rawName, e.exercise?.id ?? null, e.match])).toEqual([
      ['Cadeira abdutora', 'novo-1', 'manual'],
      ['Stiff', 'ex-stiff', 'matched'],
      ['Coice na polia', 'novo-2', 'manual'],
      ['Agachamento búlgaro (Smith ou livre)', 'novo-3', 'manual'],
      ['Elevação pélvica', null, 'not_found'],
      ['Agachamento sumô', 'novo-4', 'manual'],
    ]);
    expect(draft.days[1].exercises[0].exercise?.id).toBe('novo-1');
    // Só resta escolher o que tinha sugestão — o treino ainda não pode ser criado.
    expect(draftProblems(draft)).toEqual(['Dia 1 (GLÚTEO E POSTERIOR), exercício 5 ("Elevação pélvica"): selecione um exercício do catálogo.']);
  });

  it('cadastro em um clique no próprio exercício, inclusive o que tinha sugestão; depois o treino pode ser criado com os ids da API', async () => {
    const user = userEvent.setup();
    let latest: WorkoutDraft | null = null;
    render(<Harness onDraft={(draft) => (latest = draft)} />);

    await user.click(screen.getByRole('button', { name: 'Cadastrar os 4 no meu catálogo' }));
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(4));
    await user.click(await screen.findByRole('button', { name: 'Cadastrar “Elevação pélvica” no meu catálogo' }));
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(5));

    await waitFor(() => expect(draftProblems(latest as unknown as WorkoutDraft)).toEqual([]));
    const payload = draftToPayload(latest as unknown as WorkoutDraft);
    expect(payload.days[0].exercises.map((e) => e.exerciseId)).toEqual(['novo-1', 'ex-stiff', 'novo-2', 'novo-3', 'novo-5', 'novo-4']);
    expect(payload.days[0].exercises[0].sets).toHaveLength(3);
  });

  it('se o nome já existe no catálogo, usa o existente em vez de cadastrar outro', async () => {
    const user = userEvent.setup();
    let latest: WorkoutDraft | null = null;
    vi.mocked(api.listExercises).mockImplementation(async (search) => (search === 'Coice na polia' ? [asExercise('ex-coice', 'COICE NA POLIA')] : []));
    render(<Harness onDraft={(draft) => (latest = draft)} />);

    await user.click(screen.getByRole('button', { name: 'Cadastrar “Coice na polia” no meu catálogo' }));
    await waitFor(() => expect((latest as unknown as WorkoutDraft).days[0].exercises[2].exercise?.id).toBe('ex-coice'));
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it('falha ao cadastrar um deles: os outros seguem e o erro aparece com o nome', async () => {
    const user = userEvent.setup();
    let latest: WorkoutDraft | null = null;
    vi.mocked(api.createExercise).mockImplementation(async (input) => {
      if (input.name === 'Coice na polia') throw new Error('rede');
      return asExercise(`ok-${input.name}`, input.name);
    });
    render(<Harness onDraft={(draft) => (latest = draft)} />);

    await user.click(screen.getByRole('button', { name: 'Cadastrar os 4 no meu catálogo' }));
    await waitFor(() => expect(screen.getByText(/Não foi possível cadastrar: Coice na polia\./)).toBeInTheDocument());
    const draft = latest as unknown as WorkoutDraft;
    expect(draft.days[0].exercises[0].exercise?.id).toBe('ok-Cadeira abdutora');
    expect(draft.days[0].exercises[2].exercise).toBeNull();
    // O que falhou continua na faixa, para tentar de novo.
    expect(screen.getByRole('region', { name: 'Exercícios que não estão no catálogo' })).toHaveTextContent('1 exercício do seu texto não está no catálogo: Coice na polia.');
  });
});
