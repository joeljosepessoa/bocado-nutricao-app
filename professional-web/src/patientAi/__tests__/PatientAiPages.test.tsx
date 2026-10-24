import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ClientDetail, DietChatResult, DietTemplateContent } from '../../types/api';
import { PatientDietAiPage, PatientWorkoutAiPage } from '../PatientAiPages';

vi.mock('../../api/endpoints', () => ({
  getClientDietContent: vi.fn(),
  getClientWorkoutContent: vi.fn(),
  patientDietChat: vi.fn(),
  patientWorkoutChat: vi.fn(),
  createDietFromProposal: vi.fn(),
  createWorkoutFromProposal: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  searchFoods: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
}));

const client = { id: 'c1', user: { fullName: 'Paciente Teste', email: 'p@example.com' } } as ClientDetail;

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/clients/:clientId" element={<Outlet context={{ client }} />}>
            <Route path="diet/ia" element={<PatientDietAiPage />} />
            <Route path="workout/ia" element={<PatientWorkoutAiPage />} />
            <Route path="diet" element={<div />} />
            <Route path="workout" element={<div />} />
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const current: DietTemplateContent = {
  objective: 'Perda de gordura',
  days: [{ label: null, kind: 'other', usageNotes: null, meals: [{ name: 'Almoço atual', time: '12:00', notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, foods: [{ foodId: 'f-arroz', customFoodName: 'Arroz', quantity: 100, unit: 'g', notes: null }] }] }] }] }],
  supplements: [],
  patientGuidelines: null,
};

const changed: DietChatResult = {
  reply: 'Troquei o arroz por batata, sem lactose como pede a anamnese.',
  changed: true,
  warnings: [],
  content: { ...current, days: [{ ...current.days[0], meals: [{ ...current.days[0].meals[0], name: 'Almoço da IA' }] }] },
  foods: [{ id: 'f-arroz', name: 'Arroz cozido' }],
  nutrition: [{ label: null, min: { kcal: 1500, proteinG: 90, carbG: 160, fatG: 50, fiberG: 20 }, max: { kcal: 1500, proteinG: 90, carbG: 160, fatG: 50, fiberG: 20 }, partial: false }],
};

beforeEach(() => vi.clearAllMocks());

describe('Montar a dieta do paciente com a IA', () => {
  it('começa da dieta atual, conversa sobre ela e cria o RASCUNHO na ficha (com o objetivo)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getClientDietContent).mockResolvedValue({ content: current, foods: [{ id: 'f-arroz', name: 'Arroz cozido' }], patientAiConsent: true });
    vi.mocked(api.patientDietChat).mockResolvedValue(changed);
    vi.mocked(api.createDietFromProposal).mockResolvedValue({} as never);
    renderAt('/clients/c1/diet/ia');

    expect((await screen.findAllByDisplayValue('Almoço atual')).length).toBeGreaterThan(0);
    expect(screen.getByText(/anamnese completa do paciente — sem nome, CPF, RG, endereço, e-mail e telefone/)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não autorizou a IA/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Mensagem para a IA'), 'Sem lactose{Enter}');
    expect(await screen.findByText(/Troquei o arroz por batata/)).toBeInTheDocument();
    const [clientId, messages, sent] = vi.mocked(api.patientDietChat).mock.calls[0];
    expect(clientId).toBe('c1');
    expect(messages).toEqual([{ role: 'professional', text: 'Sem lactose' }]);
    expect(sent).toMatchObject({ objective: 'Perda de gordura', days: [{ meals: [{ name: 'Almoço atual' }] }] });
    expect(screen.getAllByDisplayValue('Almoço da IA').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
    await waitFor(() => expect(api.createDietFromProposal).toHaveBeenCalled());
    expect(vi.mocked(api.createDietFromProposal).mock.calls[0][1]).toMatchObject({ objective: 'Perda de gordura', days: [{ meals: [{ name: 'Almoço da IA' }] }] });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/clients/c1/diet'));
  });

  it('rascunho já aberto: só substitui depois de confirmar', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getClientDietContent).mockResolvedValue({ content: current, foods: [], patientAiConsent: true });
    vi.mocked(api.createDietFromProposal)
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'Já existe um rascunho em aberto (versão 2).' } } })
      .mockResolvedValueOnce({} as never);
    renderAt('/clients/c1/diet/ia');

    await user.click(await screen.findByRole('button', { name: 'Criar dieta como rascunho' }));
    await user.click(await screen.findByRole('button', { name: 'Substituir rascunho' }));
    expect(vi.mocked(api.createDietFromProposal).mock.calls[1][1]).toMatchObject({ replaceDraft: true });
  });

  it('paciente sem autorização de IA: avisa como ele autoriza no app', async () => {
    vi.mocked(api.getClientDietContent).mockResolvedValue({ content: null, foods: [], patientAiConsent: false });
    renderAt('/clients/c1/diet/ia');
    expect(await screen.findByText(/Paciente Teste ainda não autorizou a IA/)).toBeInTheDocument();
    expect(screen.getByText('Privacidade e dados')).toBeInTheDocument();
  });
});

describe('Montar o treino do paciente com a IA', () => {
  it('sem treino ainda: pede do zero e cria o treino em rascunho', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getClientWorkoutContent).mockResolvedValue({ content: null, exercises: [], patientAiConsent: true });
    vi.mocked(api.patientWorkoutChat).mockResolvedValue({
      reply: 'Treino A sem impacto, por causa do joelho.',
      changed: true,
      warnings: ['Confira a carga no agachamento.'],
      content: {
        days: [
          {
            name: 'Treino A',
            notes: null,
            exercises: [{ exerciseId: 'ex-1', notes: null, sets: [{ reps: 12, repsMin: null, repsMax: null, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, restSeconds: 60, tempo: null, notes: null }] }],
          },
        ],
      },
      exercises: [{ id: 'ex-1', name: 'Leg press', muscleGroup: 'Pernas', equipment: 'Máquina', imageUrl: null }],
    });
    vi.mocked(api.createWorkoutFromProposal).mockResolvedValue({} as never);
    renderAt('/clients/c1/workout/ia');

    await user.type(await screen.findByLabelText('Mensagem para a IA'), 'Treino para iniciante{Enter}');
    expect(api.patientWorkoutChat).toHaveBeenCalledWith('c1', [{ role: 'professional', text: 'Treino para iniciante' }], null);
    expect(await screen.findByText(/sem impacto, por causa do joelho/)).toBeInTheDocument();
    expect(screen.getByText(/Confira a carga no agachamento/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar treino como rascunho' }));
    await waitFor(() => expect(api.createWorkoutFromProposal).toHaveBeenCalled());
    expect(vi.mocked(api.createWorkoutFromProposal).mock.calls[0][1]).toMatchObject({ days: [{ name: 'Treino A', exercises: [{ exerciseId: 'ex-1' }] }] });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/clients/c1/workout'));
  });
});
