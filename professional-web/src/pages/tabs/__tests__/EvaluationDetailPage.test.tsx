import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvaluationDetailPage } from '../EvaluationDetailPage';
import * as api from '../../../api/endpoints';
import type { EvaluationDetail } from '../../../types/api';

vi.mock('../../../api/endpoints', () => ({
  getEvaluation: vi.fn(),
  setEvaluationRelease: vi.fn(),
  generateReport: vi.fn(),
  explainEvaluation: vi.fn(),
  narrateTrend: vi.fn(),
}));

function makeEvaluation(overrides: Partial<EvaluationDetail> = {}): EvaluationDetail {
  return {
    id: 'eval-1',
    clientId: 'client-1',
    professionalId: 'prof-1',
    evaluatedAt: '2026-01-15T00:00:00Z',
    ageAtEvaluation: 30,
    biologicalSexForCalculation: 'female',
    heightCm: 165,
    weightKg: 60,
    protocolId: null,
    bloodPressureSystolic: null,
    bloodPressureDiastolic: null,
    heartRate: null,
    glucose: null,
    notes: null,
    releasedToClientAt: null,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    measurements: null,
    skinfolds: null,
    bioimpedance: null,
    calculatedMetrics: null,
    protocol: null,
    photos: [],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients/client-1/evaluations/eval-1']}>
        <Routes>
          <Route path="/clients/:clientId/evaluations/:evaluationId" element={<EvaluationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EvaluationDetailPage — confirmação ao liberar avaliação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('clicar em "Liberar ao cliente" mostra o diálogo de confirmação e NÃO libera sem confirmar', async () => {
    vi.mocked(api.getEvaluation).mockResolvedValue(makeEvaluation());
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Liberar ao cliente' }));

    expect(await screen.findByText(/Você deseja liberar esta avaliação para o cliente\?/)).toBeInTheDocument();
    expect(screen.getByText(/o cliente poderá visualizar os dados autorizados desta avaliação/)).toBeInTheDocument();
    expect(api.setEvaluationRelease).not.toHaveBeenCalled();
  });

  it('confirmar no diálogo chama a liberação e mostra a mensagem de sucesso', async () => {
    vi.mocked(api.getEvaluation).mockResolvedValue(makeEvaluation());
    vi.mocked(api.setEvaluationRelease).mockResolvedValue({ id: 'eval-1', releasedToClientAt: '2026-01-20T00:00:00Z' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Liberar ao cliente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Liberar para cliente' }));

    await waitFor(() => expect(api.setEvaluationRelease).toHaveBeenCalledWith('client-1', 'eval-1', true));
    expect(await screen.findByText('Avaliação liberada para o cliente.')).toBeInTheDocument();
  });

  it('cancelar no diálogo fecha sem liberar', async () => {
    vi.mocked(api.getEvaluation).mockResolvedValue(makeEvaluation());
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Liberar ao cliente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByText(/Você deseja liberar esta avaliação para o cliente\?/)).not.toBeInTheDocument(),
    );
    expect(api.setEvaluationRelease).not.toHaveBeenCalled();
  });

  it('"Retirar liberação" (avaliação já liberada) age direto, sem diálogo de confirmação', async () => {
    vi.mocked(api.getEvaluation).mockResolvedValue(makeEvaluation({ releasedToClientAt: '2026-01-16T00:00:00Z' }));
    vi.mocked(api.setEvaluationRelease).mockResolvedValue({ id: 'eval-1', releasedToClientAt: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Retirar liberação' }));

    await waitFor(() => expect(api.setEvaluationRelease).toHaveBeenCalledWith('client-1', 'eval-1', false));
    expect(screen.queryByText(/Você deseja liberar esta avaliação para o cliente\?/)).not.toBeInTheDocument();
  });
});
