import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { OrganizedDietProposal } from '../../types/api';
import { DietAssistantPage } from '../DietAssistantPage';

vi.mock('../../api/endpoints', () => ({
  organizeDiet: vi.fn(),
  createDietFromProposal: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  listFoods: vi.fn(),
}));

const proposal: OrganizedDietProposal = {
  warnings: [],
  meals: [
    {
      name: 'CAFÉ DA MANHÃ',
      time: null,
      notes: null,
      warnings: [],
      items: [
        {
          sourceText: '2 fatias de pão integral',
          rawFood: 'Pão integral',
          quantity: 2,
          unitText: 'fatias',
          unit: 'slice',
          notes: null,
          matchStatus: 'matched',
          matchedFood: { id: 'f-pao', name: 'Pão integral' },
          candidates: [],
          warnings: [],
        },
        {
          sourceText: '150 g de fruta',
          rawFood: 'Fruta',
          quantity: 150,
          unitText: 'g',
          unit: 'g',
          notes: null,
          matchStatus: 'ambiguous',
          matchedFood: null,
          candidates: [{ id: 'f-mamao', name: 'Mamão papaia' }],
          warnings: ['Alimento com mais de uma correspondência possível — escolha no catálogo.'],
        },
      ],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/clients/c1/diet/assistant']}>
        <Routes>
          <Route path="/clients/:clientId/diet/assistant" element={<DietAssistantPage />} />
          <Route path="/clients/:clientId/diet" element={<div>Aba Dieta</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function organizeSample() {
  const user = userEvent.setup();
  vi.mocked(api.organizeDiet).mockResolvedValue({ text: '', structuredData: proposal } as never);
  renderPage();
  await user.type(screen.getByLabelText(/Cole aqui a dieta/), 'CAFÉ DA MANHÃ{enter}2 fatias de pão integral{enter}150 g de fruta');
  await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
  await screen.findByText(/Proposta de dieta organizada por IA/);
  return user;
}

describe('Assistente de Dieta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deixa claro que a IA não altera a prescrição', () => {
    renderPage();
    expect(screen.getByRole('note').textContent).toMatch(/A IA não altera quantidades, alimentos ou prescrição/);
  });

  it('mostra a proposta com o texto original e as quantidades intactas; não cria com alimento pendente', async () => {
    const user = await organizeSample();
    expect(api.organizeDiet).toHaveBeenCalledWith('c1', expect.stringContaining('150 g de fruta'));
    expect(screen.getByText('150 g de fruta')).toBeTruthy();
    expect((screen.getByLabelText('Quantidade de Fruta') as HTMLInputElement).value).toBe('150');
    expect((screen.getByLabelText('Quantidade de Pão integral') as HTMLInputElement).value).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
    expect(await screen.findByText(/Escolha o alimento no catálogo/, { selector: 'li' })).toBeTruthy();
    expect(api.createDietFromProposal).not.toHaveBeenCalled();
  });

  it('o profissional escolhe a sugestão e cria RASCUNHO; rascunho existente só é substituído após confirmação', async () => {
    const user = await organizeSample();
    await user.click(screen.getByRole('button', { name: 'Mamão papaia' }));

    vi.mocked(api.createDietFromProposal)
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'Já existe um rascunho em aberto (versão 2).' } } })
      .mockResolvedValueOnce({} as never);
    await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
    expect(await screen.findByText('Substituir o rascunho atual?')).toBeTruthy();
    expect(vi.mocked(api.createDietFromProposal).mock.calls[0][1]).toEqual({
      meals: [
        {
          name: 'CAFÉ DA MANHÃ',
          time: null,
          notes: null,
          foods: [
            { foodId: 'f-pao', quantity: 2, unit: 'slice', notes: null },
            { foodId: 'f-mamao', quantity: 150, unit: 'g', notes: null },
          ],
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Substituir rascunho' }));
    expect(await screen.findByText('Aba Dieta')).toBeTruthy();
    expect(vi.mocked(api.createDietFromProposal).mock.calls[1][1]).toMatchObject({ replaceDraft: true });
  });

  it('erro da IA (resposta recusada) é mostrado e nada é salvo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizeDiet).mockRejectedValue({
      response: { status: 503, data: { message: 'A organização foi recusada porque alteraria a dieta escrita.' } },
    });
    renderPage();
    await user.type(screen.getByLabelText(/Cole aqui a dieta/), 'ALMOÇO');
    await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/alteraria a dieta escrita/);
    expect(api.createDietFromProposal).not.toHaveBeenCalled();
  });
});
