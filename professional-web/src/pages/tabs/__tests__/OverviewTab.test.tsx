import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../api/endpoints';
import type { ClientDetail } from '../../../types/api';
import { OverviewTab } from '../OverviewTab';

vi.mock('../../../api/endpoints', () => ({
  updateClient: vi.fn(),
  resetClientPassword: vi.fn(),
}));
vi.mock('../../../anamnesis/AnamnesisSummaryCard', () => ({ AnamnesisSummaryCard: () => null }));

const client: ClientDetail = {
  id: 'c1',
  professionalId: 'p1',
  birthDate: null,
  phone: '51 99999-0000',
  gender: null,
  notes: null,
  status: 'active',
  archivedAt: null,
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  targetWeightKg: null,
  waterGoalMl: null,
  user: { email: 'paciente.antigo@hotmail.com', fullName: 'Paciente Teste' },
};

function renderTab() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/clients/c1']}>
        <Routes>
          <Route path="/clients/:clientId" element={<Outlet context={{ client }} />}>
            <Route index element={<OverviewTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Visão geral — dados básicos', () => {
  beforeEach(() => {
    vi.mocked(api.updateClient).mockReset().mockResolvedValue(client);
  });

  it('corrige o e-mail do paciente, avisando que muda o login', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveValue('paciente.antigo@hotmail.com');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    await userEvent.clear(email);
    await userEvent.type(email, ' paciente.novo@gmail.com ');
    expect(screen.getByRole('note')).toHaveTextContent('passa a entrar com paciente.novo@gmail.com');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.updateClient).toHaveBeenCalledWith('c1', expect.objectContaining({ email: 'paciente.novo@gmail.com' })));
  });

  it('não manda o e-mail quando não mudou, e recusa e-mail inválido', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.updateClient).toHaveBeenCalled());
    expect(vi.mocked(api.updateClient).mock.calls[0][1]).not.toHaveProperty('email');

    await userEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
    await userEvent.clear(screen.getByLabelText('E-mail'));
    await userEvent.type(screen.getByLabelText('E-mail'), 'sem-arroba');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um e-mail válido');
    expect(api.updateClient).toHaveBeenCalledTimes(1);
  });

  it('e-mail já usado: explica o motivo', async () => {
    vi.mocked(api.updateClient).mockRejectedValue(new Error('400'));
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
    await userEvent.clear(screen.getByLabelText('E-mail'));
    await userEvent.type(screen.getByLabelText('E-mail'), 'outra@conta.com');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('já ser usado por outra conta');
  });
});
