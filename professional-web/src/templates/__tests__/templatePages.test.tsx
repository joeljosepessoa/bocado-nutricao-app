import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ClientListItem, DietTemplateDetail, TemplateSummary } from '../../types/api';
import { TemplatesPage } from '../TemplatesPage';
import { DietTemplateEditorPage } from '../TemplateEditorPages';
import { ApplyTemplateModal } from '../ApplyTemplateModal';

vi.mock('../../api/endpoints', () => ({
  listTemplates: vi.fn(),
  listClients: vi.fn(),
  applyTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  restoreTemplate: vi.fn(),
  getDietTemplate: vi.fn(),
  createDietTemplate: vi.fn(),
  updateDietTemplate: vi.fn(),
  searchFoods: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
}));

const summary = (overrides: Partial<TemplateSummary> = {}): TemplateSummary => ({
  id: 't1',
  kind: 'diet',
  name: 'Emagrecimento 1600',
  description: 'Para quem treina de manhã',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  deletedAt: null,
  counts: { days: 1, meals: 5 },
  ...overrides,
});

const patient = (id: string, fullName: string): ClientListItem => ({ id, status: 'active', createdAt: '2026-09-01T00:00:00.000Z', user: { email: `${id}@example.com`, fullName } });

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderAt(path: string, pattern: string, page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={page} />
          <Route path="*" element={<div />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listClients).mockResolvedValue({ items: [patient('c1', 'Paciente Um'), patient('c2', 'Paciente Dois')], total: 2, page: 1, pageSize: 100 });
});

describe('Modelos — biblioteca', () => {
  it('lista os modelos de dieta com o resumo; a aba Treinos busca os de treino', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listTemplates).mockImplementation(async (kind) =>
      kind === 'diet' ? [summary()] : [summary({ id: 'w1', kind: 'workout', name: 'ABC iniciante', counts: { days: 3, exercises: 18 } })],
    );
    renderAt('/modelos', '/modelos', <TemplatesPage />);

    expect(await screen.findByText('Emagrecimento 1600')).toBeInTheDocument();
    expect(screen.getByText(/1 dia · 5 refeições/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Treinos' }));
    expect(await screen.findByText('ABC iniciante')).toBeInTheDocument();
    expect(screen.getByText(/3 dias · 18 exercícios/)).toBeInTheDocument();
    expect(api.listTemplates).toHaveBeenCalledWith('workout', false);
    expect(screen.getByRole('button', { name: '+ Novo modelo de treino' })).toBeInTheDocument();
  });

  it('"Atribuir a paciente": escolhe o paciente, cria o rascunho e abre a aba Dieta dele', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listTemplates).mockResolvedValue([summary()]);
    vi.mocked(api.applyTemplate).mockResolvedValue();
    renderAt('/modelos', '/modelos', <TemplatesPage />);

    await user.click(await screen.findByRole('button', { name: 'Atribuir a paciente' }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Paciente');
    await within(select).findByRole('option', { name: 'Paciente Dois' });
    await user.selectOptions(select, 'c2');
    await user.click(within(dialog).getByRole('button', { name: 'Atribuir ao paciente' }));

    expect(api.applyTemplate).toHaveBeenCalledWith('diet', 't1', 'c2', false);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/clients/c2/diet'));
  });

  it('excluir manda para a lixeira; na lixeira dá para restaurar', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listTemplates).mockImplementation(async (_kind, trash) => (trash ? [summary({ deletedAt: '2026-10-22T10:00:00.000Z' })] : [summary()]));
    vi.mocked(api.deleteTemplate).mockResolvedValue();
    vi.mocked(api.restoreTemplate).mockResolvedValue(summary());
    renderAt('/modelos', '/modelos', <TemplatesPage />);

    await user.click(await screen.findByRole('button', { name: 'Excluir Emagrecimento 1600' }));
    await user.click(await screen.findByRole('button', { name: 'Mandar para a lixeira' }));
    expect(api.deleteTemplate).toHaveBeenCalledWith('diet', 't1');

    await user.click(screen.getByRole('button', { name: 'Lixeira' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    expect(api.restoreTemplate).toHaveBeenCalledWith('diet', 't1');
  });
});

const detail: DietTemplateDetail = {
  ...summary(),
  content: {
    objective: 'Perda de gordura',
    days: [{ label: null, kind: 'other', usageNotes: null, meals: [{ name: 'Almoço', time: '12:00', notes: null, groups: [{ kind: 'fixed', label: null, choices: [{ label: null, foods: [{ customFoodName: 'Arroz', foodId: 'f-arroz', quantity: 100, unit: 'g', notes: null }] }] }] }] }],
    supplements: [],
    patientGuidelines: null,
  },
  foods: [{ id: 'f-arroz', name: 'Arroz branco cozido' }],
};

describe('Modelos — editor de dieta', () => {
  it('modelo novo sem nome: avisa e não salva', async () => {
    const user = userEvent.setup();
    renderAt('/modelos/dietas/novo', '/modelos/dietas/novo', <DietTemplateEditorPage />);

    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByText('Dê um nome ao modelo.')).toBeInTheDocument();
    expect(api.createDietTemplate).not.toHaveBeenCalled();
  });

  it('abre o modelo salvo, troca o nome e salva o mesmo conteúdo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getDietTemplate).mockResolvedValue(detail);
    vi.mocked(api.updateDietTemplate).mockResolvedValue(summary({ name: 'Emagrecimento 1500' }));
    renderAt('/modelos/dietas/t1', '/modelos/dietas/:templateId', <DietTemplateEditorPage />);

    const name = await screen.findByLabelText('Nome do modelo');
    expect(name).toHaveValue('Emagrecimento 1600');
    expect(screen.getByLabelText('Objetivo')).toHaveValue('Perda de gordura');
    await user.clear(name);
    await user.type(name, 'Emagrecimento 1500');
    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));

    await waitFor(() => expect(api.updateDietTemplate).toHaveBeenCalled());
    expect(vi.mocked(api.updateDietTemplate).mock.calls[0]).toEqual([
      't1',
      { name: 'Emagrecimento 1500', description: 'Para quem treina de manhã', content: { ...detail.content, patientGuidelines: null } },
    ]);
    expect(await screen.findByText('Modelo salvo.')).toBeInTheDocument();
  });
});

describe('"Usar um modelo" na ficha do paciente', () => {
  it('escolhe o modelo; rascunho de dieta já aberto só é trocado depois de confirmar', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    vi.mocked(api.listTemplates).mockResolvedValue([summary(), summary({ id: 't2', name: 'Ganho de massa', description: null })]);
    vi.mocked(api.applyTemplate)
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'Já existe um rascunho em aberto (versão 2).' } } })
      .mockResolvedValueOnce();
    renderAt('/clients/c1/diet', '/clients/:clientId/diet', <ApplyTemplateModal kind="diet" clientId="c1" onClose={vi.fn()} onApplied={onApplied} />);

    // O paciente já está escolhido: só aparece a lista de modelos.
    expect(screen.queryByLabelText('Paciente')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: /Ganho de massa/ }));
    await user.click(screen.getByRole('button', { name: 'Usar este modelo' }));

    expect(api.applyTemplate).toHaveBeenNthCalledWith(1, 'diet', 't2', 'c1', false);
    await user.click(await screen.findByRole('button', { name: 'Substituir rascunho' }));
    expect(api.applyTemplate).toHaveBeenNthCalledWith(2, 'diet', 't2', 'c1', true);
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith('c1'));
  });

  it('sem modelos ainda: explica onde criar', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([]);
    renderAt('/clients/c1/workout', '/clients/:clientId/workout', <ApplyTemplateModal kind="workout" clientId="c1" onClose={vi.fn()} onApplied={vi.fn()} />);
    expect(await screen.findByText(/Você ainda não tem modelos de treino/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar este modelo' })).toBeDisabled();
  });
});
