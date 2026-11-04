import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { TrashItem } from '../../types/api';
import { TrashPage } from '../TrashPage';

vi.mock('../../api/endpoints', () => ({
  listTrash: vi.fn(),
  restoreTrashItem: vi.fn(),
  purgeTrashItem: vi.fn(),
}));

const ITEMS: TrashItem[] = [
  { kind: 'report', id: 'r1', title: 'Relatório da avaliação', clientId: 'c1', clientName: 'Paciente Um', deletedAt: '2026-11-03T12:00:00Z', canPurge: true, audience: 'client', evaluatedAt: '2026-10-20T12:00:00Z' },
  { kind: 'diet', id: 'd1', title: 'Dieta: Emagrecimento', clientId: 'c1', clientName: 'Paciente Um', deletedAt: '2026-11-02T12:00:00Z', canPurge: false },
  { kind: 'diet_template', id: 't1', title: 'Low carb', clientId: null, clientName: null, deletedAt: '2026-11-01T12:00:00Z', canPurge: true },
  { kind: 'form', id: 'f1', title: 'Check-in', clientId: null, clientName: null, deletedAt: '2026-10-30T12:00:00Z', canPurge: false },
];

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowOf = (target: string | HTMLElement) => (typeof target === 'string' ? screen.getByText(target) : target).closest('li') as HTMLElement;

describe('Lixeira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listTrash).mockResolvedValue(ITEMS);
    vi.mocked(api.restoreTrashItem).mockResolvedValue(undefined);
    vi.mocked(api.purgeTrashItem).mockResolvedValue(undefined);
  });

  it('lista tudo com tipo, paciente e data; dieta e formulário com respostas não têm "Apagar de vez"', async () => {
    renderPage();
    const report = rowOf(await screen.findByText('Relatório para o paciente · avaliação de 20/10/2026'));
    expect(report.textContent).toContain('Paciente Um');
    expect(within(report).getByRole('button', { name: /Apagar de vez/ })).toBeInTheDocument();

    const diet = rowOf('Dieta: Emagrecimento');
    expect(within(diet).queryByRole('button', { name: /Apagar de vez/ })).toBeNull();
    expect(diet.textContent).toContain('Fica guardado no histórico do paciente.');
    expect(rowOf('Check-in').textContent).toContain('Tem respostas de pacientes');

    await userEvent.click(screen.getByRole('tab', { name: /Modelos/ }));
    expect(screen.getByText('Low carb')).toBeInTheDocument();
    expect(screen.queryByText('Dieta: Emagrecimento')).toBeNull();
  });

  it('restaurar avisa onde o item voltou; recusa do servidor aparece como erro', async () => {
    renderPage();
    await screen.findByText('Dieta: Emagrecimento');
    await userEvent.click(within(rowOf('Low carb')).getByRole('button', { name: /Restaurar/ }));
    expect(api.restoreTrashItem).toHaveBeenCalledWith('diet_template', 't1');
    expect((await screen.findByRole('status')).textContent).toContain('em Modelos');

    vi.mocked(api.restoreTrashItem).mockRejectedValueOnce({
      response: { data: { message: 'Este paciente já tem uma dieta. Exclua a dieta atual dele antes de restaurar esta.' } },
    });
    await userEvent.click(within(rowOf('Dieta: Emagrecimento')).getByRole('button', { name: /Restaurar/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('já tem uma dieta');
  });

  it('apagar de vez pede confirmação', async () => {
    renderPage();
    await userEvent.click(within(rowOf(await screen.findByText('Low carb'))).getByRole('button', { name: /Apagar de vez/ }));
    expect(api.purgeTrashItem).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar de vez' }));
    await waitFor(() => expect(api.purgeTrashItem).toHaveBeenCalledWith('diet_template', 't1'));
  });

  it('vazia', async () => {
    vi.mocked(api.listTrash).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('A lixeira está vazia')).toBeInTheDocument();
  });
});
