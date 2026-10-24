import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { DietChatResult, DietTemplateDetail, WorkoutChatResult } from '../../types/api';
import { DietTemplateEditorPage, WorkoutTemplateEditorPage } from '../TemplateEditorPages';

vi.mock('../../api/endpoints', () => ({
  templateDietChat: vi.fn(),
  templateWorkoutChat: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  getDietTemplate: vi.fn(),
  createDietTemplate: vi.fn(),
  updateDietTemplate: vi.fn(),
  listClients: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
  searchFoods: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
}));

function renderAt(path: string, pattern: string, page: ReactElement, extra?: { pattern: string; page: ReactElement }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={page} />
          {extra ? <Route path={extra.pattern} element={extra.page} /> : null}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nutrients = (kcal: number) => ({ kcal, proteinG: 120, carbG: 180, fatG: 60, fiberG: 20 });

const dietResult: DietChatResult = {
  reply: 'Montei 2 refeições de 1.800 kcal.',
  changed: true,
  warnings: ['Não achei tofu no catálogo.'],
  content: {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          { name: 'Desjejum IA', time: '07:00', notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, foods: [{ foodId: 'f-ovo', customFoodName: 'Ovo cozido', quantity: 100, unit: 'g', notes: null }] }] }] },
        ],
      },
    ],
    supplements: [],
    patientGuidelines: null,
  },
  foods: [{ id: 'f-ovo', name: 'Ovo, de galinha, cozido' }],
  nutrition: [{ label: null, min: nutrients(1780), max: nutrients(1780), partial: false }],
};

beforeEach(() => vi.clearAllMocks());

describe('Conversa com a IA no modelo de dieta', () => {
  it('modelo novo: pede do zero (sem modelo atual), aplica no editor, mostra resposta, avisos e calorias; dá para desfazer', async () => {
    const user = userEvent.setup();
    vi.mocked(api.templateDietChat).mockResolvedValue(dietResult);
    renderAt('/modelos/dietas/novo', '/modelos/dietas/novo', <DietTemplateEditorPage />);

    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Monte uma dieta de 1800 kcal{Enter}');

    expect(api.templateDietChat).toHaveBeenCalledWith([{ role: 'professional', text: 'Monte uma dieta de 1800 kcal' }], null);
    expect(await screen.findByText('Montei 2 refeições de 1.800 kcal.')).toBeInTheDocument();
    expect(screen.getByText('✓ Modelo atualizado no editor')).toBeInTheDocument();
    expect(screen.getByText(/1\.780 kcal · P 120 g · C 180 g · G 60 g/)).toBeInTheDocument();
    expect(screen.getByText(/Não achei tofu no catálogo/)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Desjejum IA').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Desfazer última mudança' }));
    expect(screen.queryByDisplayValue('Desjejum IA')).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Café da manhã').length).toBeGreaterThan(0);
  });

  it('modelo novo salvo: a conversa continua na tela do modelo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.templateDietChat).mockResolvedValue(dietResult);
    const saved = { id: 't9', kind: 'diet' as const, name: 'Base IA', description: null, createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z', deletedAt: null, counts: { days: 1, meals: 1 } };
    vi.mocked(api.createDietTemplate).mockResolvedValue(saved);
    vi.mocked(api.getDietTemplate).mockResolvedValue({ ...saved, content: dietResult.content!, foods: dietResult.foods });
    renderAt('/modelos/dietas/novo', '/modelos/dietas/novo', <DietTemplateEditorPage />, { pattern: '/modelos/dietas/:templateId', page: <DietTemplateEditorPage /> });

    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Monte{Enter}');
    await screen.findByText('Montei 2 refeições de 1.800 kcal.');
    await user.type(screen.getByLabelText('Nome do modelo'), 'Base IA');
    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));

    expect(await screen.findByText('Modelo salvo.')).toBeInTheDocument();
    expect(screen.getByText('Montei 2 refeições de 1.800 kcal.')).toBeInTheDocument();
    expect(screen.getByText('Monte')).toBeInTheDocument();
  });

  it('segunda mensagem leva a conversa e o modelo atual do editor', async () => {
    const user = userEvent.setup();
    vi.mocked(api.templateDietChat).mockResolvedValueOnce(dietResult).mockResolvedValueOnce({ ...dietResult, reply: 'Aumentei o ovo.', changed: false, warnings: [] });
    renderAt('/modelos/dietas/novo', '/modelos/dietas/novo', <DietTemplateEditorPage />);

    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Monte{Enter}');
    await screen.findByText('Montei 2 refeições de 1.800 kcal.');
    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Mais ovo{Enter}');
    await screen.findByText('Aumentei o ovo.');

    const [messages, current] = vi.mocked(api.templateDietChat).mock.calls[1];
    expect(messages).toEqual([
      { role: 'professional', text: 'Monte' },
      { role: 'assistant', text: 'Montei 2 refeições de 1.800 kcal.' },
      { role: 'professional', text: 'Mais ovo' },
    ]);
    expect(current?.days[0].meals[0]).toMatchObject({ name: 'Desjejum IA', time: '07:00' });
    expect(current?.days[0].meals[0].groups[0].choices[0].foods[0]).toMatchObject({ foodId: 'f-ovo', customFoodName: 'Ovo cozido', quantity: 100 });
  });

  it('modelo com aviso no editor: pede para corrigir antes e não chama a IA', async () => {
    const user = userEvent.setup();
    const broken: DietTemplateDetail = {
      id: 't1',
      kind: 'diet',
      name: 'Base',
      description: null,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
      deletedAt: null,
      counts: { days: 1, meals: 1 },
      content: { ...dietResult.content!, days: [{ ...dietResult.content!.days[0], meals: [{ ...dietResult.content!.days[0].meals[0], name: 'Almoço' }] }] },
      foods: dietResult.foods,
    };
    vi.mocked(api.getDietTemplate).mockResolvedValue(broken);
    renderAt('/modelos/dietas/t1', '/modelos/dietas/:templateId', <DietTemplateEditorPage />);

    const mealName = (await screen.findAllByDisplayValue('Almoço'))[0];
    await user.clear(mealName);
    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Ajuste{Enter}');
    expect(await screen.findByText(/Antes de pedir à IA, corrija no editor/)).toBeInTheDocument();
    expect(api.templateDietChat).not.toHaveBeenCalled();
  });

  it('conta sem IA ativada: oferece ativar e reenvia o pedido', async () => {
    const user = userEvent.setup();
    vi.mocked(api.templateDietChat)
      .mockRejectedValueOnce({ response: { status: 403, data: { message: 'Você ainda não ativou as ferramentas de IA para sua conta.' } } })
      .mockResolvedValueOnce(dietResult);
    vi.mocked(api.acceptProfessionalAiConsent).mockResolvedValue();
    renderAt('/modelos/dietas/novo', '/modelos/dietas/novo', <DietTemplateEditorPage />);

    await user.click(screen.getByRole('button', { name: /1\.800 kcal com 5 refeições/ }));
    await user.click(await screen.findByRole('button', { name: 'Ativar IA para minha conta' }));

    await waitFor(() => expect(api.templateDietChat).toHaveBeenCalledTimes(2));
    expect(api.acceptProfessionalAiConsent).toHaveBeenCalled();
    expect(await screen.findByText('Montei 2 refeições de 1.800 kcal.')).toBeInTheDocument();
  });
});

describe('Conversa com a IA no modelo de treino', () => {
  it('monta o treino no editor com os exercícios do catálogo', async () => {
    const user = userEvent.setup();
    const result: WorkoutChatResult = {
      reply: 'Treino A pronto.',
      changed: true,
      warnings: [],
      content: {
        days: [
          {
            name: 'Treino A — Pernas',
            notes: null,
            exercises: [
              {
                exerciseId: 'ex-1',
                notes: null,
                sets: [{ reps: 12, repsMin: null, repsMax: null, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, restSeconds: 60, tempo: null, notes: null }],
              },
            ],
          },
        ],
      },
      exercises: [{ id: 'ex-1', name: 'Agachamento livre', muscleGroup: 'Quadríceps', equipment: 'Barra', imageUrl: null }],
    };
    vi.mocked(api.templateWorkoutChat).mockResolvedValue(result);
    renderAt('/modelos/treinos/novo', '/modelos/treinos/novo', <WorkoutTemplateEditorPage />);

    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Treino de pernas{Enter}');
    expect(api.templateWorkoutChat).toHaveBeenCalledWith([{ role: 'professional', text: 'Treino de pernas' }], null);
    expect(await screen.findByText('Treino A pronto.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Treino A — Pernas')).toBeInTheDocument();
    expect(screen.getAllByText('Agachamento livre').length).toBeGreaterThan(0);
  });
});
