import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ClientListItem, ReportOverviewItem } from '../../types/api';
import { EvaluationsPage } from '../EvaluationsPage';
import { ReportsPage } from '../ReportsPage';
import { AiPage } from '../AiPage';

vi.mock('../../api/endpoints', () => ({
  listClients: vi.fn(),
  listEvaluationSummary: vi.fn(),
  listAllReports: vi.fn(),
  listEvaluations: vi.fn(),
  setReportRelease: vi.fn(),
  getReportDownloadUrl: vi.fn(),
  generateReport: vi.fn(),
}));

const patient = (id: string, fullName: string, status: ClientListItem['status'] = 'active'): ClientListItem => ({
  id,
  status,
  createdAt: '2026-09-01T00:00:00.000Z',
  user: { email: `${id}@example.com`, fullName },
});

const PATIENTS = [patient('c1', 'Paciente Avaliado'), patient('c2', 'Paciente Novo'), patient('c3', 'Paciente Arquivado', 'archived')];

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderAt(path: string, page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={page} />
          <Route path="*" element={<div />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listClients).mockResolvedValue({ items: PATIENTS, total: 3, page: 1, pageSize: 100 });
  vi.mocked(api.listEvaluationSummary).mockResolvedValue([
    { clientId: 'c1', total: 2, lastEvaluationId: 'ev-last', lastEvaluatedAt: '2026-10-01T12:00:00.000Z' },
  ]);
});

describe('Avaliação (menu)', () => {
  it('mostra a última avaliação de quem tem, "Sem avaliação" de quem não tem, e esconde arquivados', async () => {
    renderAt('/avaliacao', <EvaluationsPage />);

    expect(await screen.findByText('Última em 01/10/2026 · 2 avaliações')).toBeInTheDocument();
    expect(screen.getByText('Sem avaliação')).toBeInTheDocument();
    expect(screen.queryByText('Paciente Arquivado')).not.toBeInTheDocument();
  });

  it('"+ Nova avaliação" abre o formulário daquele paciente', async () => {
    const user = userEvent.setup();
    renderAt('/avaliacao', <EvaluationsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nova avaliação de Paciente Novo' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/clients/c2/evaluations/new');
  });

  it('"Ver última" leva direto para a última avaliação', async () => {
    const user = userEvent.setup();
    renderAt('/avaliacao', <EvaluationsPage />);

    await user.click(await screen.findByRole('button', { name: 'Ver última' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/clients/c1/evaluations/ev-last');
  });
});

const report = (overrides: Partial<ReportOverviewItem>): ReportOverviewItem => ({
  id: 'r1',
  evaluationId: 'ev-last',
  audience: 'professional',
  status: 'ready',
  templateVersion: 2,
  sizeBytes: 1000,
  generatedAt: '2026-10-01T15:00:00.000Z',
  releasedToClientAt: null,
  failureReason: null,
  createdAt: '2026-10-01T15:00:00.000Z',
  clientId: 'c1',
  clientName: 'Paciente Avaliado',
  evaluatedAt: '2026-10-01T12:00:00.000Z',
  ...overrides,
});

describe('Relatórios (menu)', () => {
  beforeEach(() => {
    vi.mocked(api.listAllReports).mockResolvedValue({
      items: [report({ id: 'r2', audience: 'client', clientId: 'c1' }), report({ id: 'r1', clientId: 'c9', clientName: 'Outra Pessoa', evaluatedAt: '2026-09-05T12:00:00.000Z' })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
  });

  it('lista os relatórios de todos os pacientes e filtra pelo nome', async () => {
    const user = userEvent.setup();
    renderAt('/relatorios', <ReportsPage />);

    expect(await screen.findByRole('button', { name: 'Paciente Avaliado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outra Pessoa' })).toBeInTheDocument();
    expect(screen.getByText('05/09/2026')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Filtrar por paciente'), 'outra');
    expect(screen.queryByRole('button', { name: 'Paciente Avaliado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outra Pessoa' })).toBeInTheDocument();
  });

  it('relatório do paciente ainda não liberado: "Liberar no app" libera pelo paciente certo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setReportRelease).mockResolvedValue(report({ id: 'r2', audience: 'client', releasedToClientAt: '2026-10-22T00:00:00.000Z' }));
    renderAt('/relatorios', <ReportsPage />);

    expect(await screen.findByText('Ainda não liberado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Liberar no app' }));
    expect(api.setReportRelease).toHaveBeenCalledWith('c1', 'r2', true);
  });

  it('"+ Gerar relatório": só oferece pacientes com avaliação e depois pede a avaliação', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listEvaluations).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderAt('/relatorios', <ReportsPage />);

    await user.click(await screen.findByRole('button', { name: '+ Gerar relatório' }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Paciente');
    await within(select).findByRole('option', { name: 'Paciente Avaliado' });
    expect(within(select).queryByRole('option', { name: 'Paciente Novo' })).not.toBeInTheDocument();

    await user.selectOptions(select, 'c1');
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByLabelText('Avaliação')).toBeInTheDocument();
    expect(api.listEvaluations).toHaveBeenCalledWith('c1');
  });
});

describe('Inteligência Artificial (menu)', () => {
  it('ferramentas ficam bloqueadas até escolher o paciente; "Montar dieta com a IA" abre o assistente no modo criar', async () => {
    const user = userEvent.setup();
    renderAt('/ia', <AiPage />);

    const create = screen.getByRole('button', { name: /Montar dieta com a IA/ });
    expect(create).toBeDisabled();

    const select = screen.getByLabelText('Paciente');
    await within(select).findByRole('option', { name: 'Paciente Avaliado' });
    expect(within(select).queryByRole('option', { name: 'Paciente Arquivado' })).not.toBeInTheDocument();
    await user.selectOptions(select, 'c1');

    await user.click(screen.getByRole('button', { name: /Montar dieta com a IA/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/clients/c1/diet/assistant?modo=criar');
  });

  it('paciente sem avaliação: "Explicar a avaliação" fica bloqueado com o motivo; treino continua disponível', async () => {
    const user = userEvent.setup();
    renderAt('/ia', <AiPage />);

    const select = screen.getByLabelText('Paciente');
    await within(select).findByRole('option', { name: 'Paciente Novo' });
    await user.selectOptions(select, 'c2');

    expect(screen.getByRole('button', { name: /Explicar a avaliação/ })).toBeDisabled();
    expect(screen.getByText('Este paciente ainda não tem avaliação física.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Organizar um treino/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/clients/c2/workout/assistant');
  });

  it('paciente com avaliação: "Explicar a avaliação" abre a última avaliação', async () => {
    const user = userEvent.setup();
    renderAt('/ia', <AiPage />);

    const select = screen.getByLabelText('Paciente');
    await within(select).findByRole('option', { name: 'Paciente Avaliado' });
    await user.selectOptions(select, 'c1');
    await user.click(screen.getByRole('button', { name: /Explicar a avaliação/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/clients/c1/evaluations/ev-last');
  });
});
