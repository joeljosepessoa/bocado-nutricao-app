import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvaluationFormPage } from '../EvaluationFormPage';
import { evaluationDraftKey, loadEvaluationDraft, saveEvaluationDraft } from '../../../utils/evaluationDraft';
import * as api from '../../../api/endpoints';
import type { EvaluationDetail } from '../../../types/api';

vi.mock('../../../api/endpoints', () => ({
  createEvaluation: vi.fn(),
  updateEvaluation: vi.fn(),
  getEvaluation: vi.fn(),
  generateDraftNote: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
}));

function renderNewEvaluationPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients/client-1/evaluations/new']}>
        <Routes>
          <Route path="/clients/:clientId/evaluations/new" element={<EvaluationFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const draftKey = evaluationDraftKey('client-1');

describe('EvaluationFormPage — rascunho automático', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('mostra o banner e restaura o rascunho somente após confirmação explícita', async () => {
    saveEvaluationDraft(draftKey, {
      heightCm: '182',
      weightKg: '81',
      biologicalSex: 'male',
      protocolCode: 'jackson_pollock_7',
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      heartRate: '',
      glucose: '',
      notes: 'nota do rascunho',
      draftInstructions: '',
      measurements: {},
      skinfolds: {},
      bioimpedance: {},
    });

    renderNewEvaluationPage();

    expect(await screen.findByText('Encontramos um rascunho não salvo desta avaliação.')).toBeInTheDocument();
    // Nunca aplica sozinho — o campo continua vazio até a confirmação.
    expect(screen.getByLabelText('Altura (cm)')).toHaveValue(null);

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar rascunho' }));

    expect(screen.getByLabelText('Altura (cm)')).toHaveValue(182);
    expect(screen.queryByText('Encontramos um rascunho não salvo desta avaliação.')).not.toBeInTheDocument();
  });

  it('descarta o rascunho sem preencher o formulário', async () => {
    saveEvaluationDraft(draftKey, {
      heightCm: '160',
      weightKg: '',
      biologicalSex: '',
      protocolCode: 'jackson_pollock_7',
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      heartRate: '',
      glucose: '',
      notes: '',
      draftInstructions: '',
      measurements: {},
      skinfolds: {},
      bioimpedance: {},
    });

    renderNewEvaluationPage();

    expect(await screen.findByText('Encontramos um rascunho não salvo desta avaliação.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByText('Encontramos um rascunho não salvo desta avaliação.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Altura (cm)')).toHaveValue(null);
    expect(loadEvaluationDraft(draftKey)).toBeNull();
  });

  it('salva o rascunho automaticamente ~1.5s após uma alteração (debounce)', async () => {
    renderNewEvaluationPage();
    // Sem rascunho pendente — o autosave já está ligado desde o início.
    await waitFor(() => expect(screen.queryByText('Encontramos um rascunho não salvo desta avaliação.')).not.toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '190' } });

    vi.advanceTimersByTime(1499);
    expect(loadEvaluationDraft(draftKey)).toBeNull();

    vi.advanceTimersByTime(2);
    expect(loadEvaluationDraft(draftKey)?.heightCm).toBe('190');
  });

  it('remove o rascunho após salvar a avaliação com sucesso', async () => {
    saveEvaluationDraft(draftKey, {
      heightCm: '170',
      weightKg: '',
      biologicalSex: '',
      protocolCode: 'jackson_pollock_7',
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      heartRate: '',
      glucose: '',
      notes: '',
      draftInstructions: '',
      measurements: {},
      skinfolds: {},
      bioimpedance: {},
    });
    vi.mocked(api.createEvaluation).mockResolvedValue({ id: 'eval-new' } as EvaluationDetail);

    renderNewEvaluationPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar rascunho' }));
    expect(loadEvaluationDraft(draftKey)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(loadEvaluationDraft(draftKey)).toBeNull());
    expect(api.createEvaluation).toHaveBeenCalledTimes(1);
  });
});
