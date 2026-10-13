import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvaluationFormPage } from '../EvaluationFormPage';
import { evaluationDraftKey, loadEvaluationDraft, saveEvaluationDraft } from '../../../utils/evaluationDraft';
import * as api from '../../../api/endpoints';
import type { ClientDetail, EvaluationDetail } from '../../../types/api';

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

/** A tela dentro da página do paciente, que é quem entrega o cadastro (nascimento, sexo). */
function renderInsideClientPage(path: string, client: Partial<ClientDetail>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/clients/:clientId" element={<Outlet context={{ client }} />}>
            <Route path="evaluations/new" element={<EvaluationFormPage />} />
            <Route path="evaluations/:evaluationId/edit" element={<EvaluationFormPage />} />
            <Route path="evaluations/:evaluationId" element={<div>detalhe</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const today = new Date();
const todayInput = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
/** Nascimento de quem faz 40 anos exatamente hoje. */
const birthDate40 = `${today.getFullYear() - 40}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const JP7 = ['Tórax (mm)', 'Axilar média (mm)', 'Tríceps (mm)', 'Subescapular (mm)', 'Abdominal (mm)', 'Suprailíaca (mm)', 'Coxa (mm)'];

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

describe('EvaluationFormPage — idade, sexo e data para o cálculo do % de gordura', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api.createEvaluation).mockResolvedValue({ id: 'eval-new' } as EvaluationDetail);
    vi.mocked(api.updateEvaluation).mockResolvedValue({ id: 'eval-1' } as EvaluationDetail);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('avaliação nova já vem com a idade e o sexo do cadastro, e os envia', async () => {
    renderInsideClientPage('/clients/client-1/evaluations/new', { birthDate: `${birthDate40}T00:00:00.000Z`, gender: 'Masculino' });

    expect(screen.getByLabelText('Data da avaliação')).toHaveValue(todayInput);
    expect(screen.getByLabelText('Idade na avaliação (anos)')).toHaveValue(40);
    expect(screen.getByLabelText('Sexo biológico (cálculo)')).toHaveValue('male');

    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.createEvaluation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createEvaluation).mock.calls[0][1];
    expect(payload).toMatchObject({ heightCm: 195, ageAtEvaluation: 40, biologicalSexForCalculation: 'male', protocolCode: 'jackson_pollock_7' });
    // Avaliação de hoje fica com a hora do servidor.
    expect(payload.evaluatedAt).toBeUndefined();
  });

  it('avaliação de outra data: a idade acompanha a data e a data é enviada', async () => {
    renderInsideClientPage('/clients/client-1/evaluations/new', { birthDate: `${birthDate40}T00:00:00.000Z`, gender: 'feminino' });

    const lastYear = `${today.getFullYear() - 1}-01-10`;
    fireEvent.change(screen.getByLabelText('Data da avaliação'), { target: { value: lastYear } });
    // Em 10 de janeiro do ano passado o aniversário (dia e mês de hoje) ainda não tinha chegado — salvo se hoje for até 10/01.
    const expectedAge = today.getMonth() > 0 || today.getDate() > 10 ? 38 : 39;
    expect(screen.getByLabelText('Idade na avaliação (anos)')).toHaveValue(expectedAge);

    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '165' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.createEvaluation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createEvaluation).mock.calls[0][1];
    expect(new Date(payload.evaluatedAt!).getFullYear()).toBe(today.getFullYear() - 1);
    expect(payload.ageAtEvaluation).toBe(expectedAge);
  });

  it('paciente sem nascimento: pede a idade e avisa que as dobras sozinhas não calculam o % de gordura', () => {
    renderInsideClientPage('/clients/client-1/evaluations/new', { birthDate: null, gender: null });

    expect(screen.getByText(/não tem data de nascimento cadastrada/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tórax (mm)'), { target: { value: '20' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Sem estas dobras o % de gordura não é calculado: Axilar média, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa.');

    for (const label of JP7) fireEvent.change(screen.getByLabelText(label), { target: { value: '20' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Para calcular o % de gordura falta informar a idade e o sexo em "Dados básicos".');

    fireEvent.change(screen.getByLabelText('Idade na avaliação (anos)'), { target: { value: '39' } });
    fireEvent.change(screen.getByLabelText('Sexo biológico (cálculo)'), { target: { value: 'male' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('edição: mostra a bioimpedância gravada, propõe a idade que faltava e não reenvia o que não mudou', async () => {
    vi.mocked(api.getEvaluation).mockResolvedValue({
      id: 'eval-1',
      evaluatedAt: `${todayInput}T15:00:00.000Z`,
      ageAtEvaluation: null,
      biologicalSexForCalculation: 'male',
      heightCm: 195,
      weightKg: 107.7,
      bloodPressureSystolic: null,
      bloodPressureDiastolic: null,
      heartRate: null,
      glucose: null,
      notes: null,
      measurements: null,
      skinfolds: null,
      bioimpedance: { origin: 'device_confirmed', recordedAt: `${todayInput}T15:00:00.000Z`, muscleMassKg: 76.3, skeletalMuscleMassKg: 50.3, boneMassKg: 5.03 },
    } as unknown as EvaluationDetail);

    renderInsideClientPage('/clients/client-1/evaluations/eval-1/edit', { birthDate: `${birthDate40}T00:00:00.000Z`, gender: 'masculino' });

    await waitFor(() => expect(screen.getByLabelText('Massa muscular (kg)')).toHaveValue(76.3));
    expect(screen.getByLabelText('Músculo esquelético (kg)')).toHaveValue(50.3);
    expect(screen.getByLabelText('Massa óssea (kg)')).toHaveValue(5.03);
    expect(screen.getByLabelText('Idade na avaliação (anos)')).toHaveValue(40);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.updateEvaluation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.updateEvaluation).mock.calls[0][2];
    expect(payload.ageAtEvaluation).toBe(40);
    expect(payload.evaluatedAt).toBeUndefined(); // a data não foi trocada: a hora original fica
    expect(payload.bioimpedance).toBeUndefined(); // leitura da balança não vira "digitada"
  });
});

describe('EvaluationFormPage — dados do modelo de avaliação (método, referência, bioimpedância, diâmetros)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api.createEvaluation).mockResolvedValue({ id: 'eval-new' } as EvaluationDetail);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('medidas separam circunferências (fita) de diâmetros ósseos (paquímetro)', () => {
    renderNewEvaluationPage();
    expect(screen.getByText('Circunferências (cm) — fita métrica')).toBeInTheDocument();
    expect(screen.getByText('Diâmetros ósseos (cm) — paquímetro')).toBeInTheDocument();
    expect(screen.getByLabelText('Punho (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fêmur bicondilar (cm)')).toBeInTheDocument();
  });

  it('envia o método do % de gordura, a referência do metabolismo e a bioimpedância com o equipamento; músculo em % vira kg', async () => {
    renderNewEvaluationPage();

    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '156.5' } });
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '64.1' } });
    fireEvent.change(screen.getByLabelText('Calcular % de gordura por'), { target: { value: 'bioimpedance' } });
    fireEvent.change(screen.getByLabelText('Referência do metabolismo basal'), { target: { value: 'mifflin_st_jeor' } });

    // Escolheu bioimpedância e ainda não digitou o % do aparelho: avisa.
    expect(screen.getByRole('alert')).toHaveTextContent('informe a "Gordura corporal (%)" do aparelho');

    fireEvent.change(screen.getByLabelText('Equipamento'), { target: { value: ' Omron ' } });
    fireEvent.change(screen.getByLabelText('Gordura corporal (%)'), { target: { value: '34.4' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Unidade de músculo esquelético'), { target: { value: 'percent' } });
    fireEvent.change(screen.getByLabelText('Músculo esquelético (%)'), { target: { value: '35.4' } });
    fireEvent.change(screen.getByLabelText('Massa muscular (kg)'), { target: { value: '38.6' } });
    fireEvent.change(screen.getByLabelText('Gordura visceral (nível)'), { target: { value: '9' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.createEvaluation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createEvaluation).mock.calls[0][1];
    expect(payload.bodyFatMethod).toBe('bioimpedance');
    expect(payload.bmrReference).toBe('mifflin_st_jeor');
    expect(payload.bioimpedance).toEqual({
      equipment: 'Omron',
      bodyFatPercent: 34.4,
      skeletalMuscleMassKg: 22.69, // 35,4% de 64,1 kg
      muscleMassKg: 38.6,
      visceralFatLevel: 9,
    });
  });

  it('músculo em % sem peso: não salva e explica o que falta', async () => {
    renderNewEvaluationPage();
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '170' } });
    fireEvent.change(screen.getByLabelText('Unidade de massa muscular'), { target: { value: 'percent' } });
    fireEvent.change(screen.getByLabelText('Massa muscular (%)'), { target: { value: '60' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Para informar músculo em % é preciso preencher o peso em "Dados básicos".')).toBeInTheDocument();
    expect(api.createEvaluation).not.toHaveBeenCalled();
  });
});
