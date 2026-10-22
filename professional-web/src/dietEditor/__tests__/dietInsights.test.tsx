import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ClientDetail, EvaluationDetail } from '../../types/api';
import { PatientSheetButton } from '../../pages/PatientSheet';
import { DietDaysView } from '../DietStructure';
import { MealMacroChart } from '../MealMacroChart';
import { NutritionTargetCard } from '../NutritionTargetCard';
import { choice, day, fixed, group, item, meal, range, version } from './fixtures';

vi.mock('../../api/endpoints', () => ({
  updateDietVersion: vi.fn(),
  listEvaluations: vi.fn(),
  getEvaluation: vi.fn(),
  getAnamnesis: vi.fn(),
  saveAnamnesis: vi.fn(),
}));

const client = {
  id: 'c1',
  birthDate: '1987-11-25',
  gender: 'feminino',
  phone: null,
  notes: null,
  status: 'active',
  targetWeightKg: 60,
  waterGoalMl: 2500,
  user: { fullName: 'Paciente Exemplo', email: 'p@example.com' },
} as unknown as ClientDetail;

const evaluation = {
  id: 'e1',
  evaluatedAt: '2026-09-21T16:00:00.000Z',
  heightCm: 156.5,
  weightKg: 64.1,
  ageAtEvaluation: 38,
  biologicalSexForCalculation: 'female',
  calculatedMetrics: { bmi: 26.2, bodyFatPercent: 23.6, leanMassKg: 48.97 },
} as unknown as EvaluationDetail;

/** Jantar com 3 opções (900 / 936 / 738 kcal) e um café fixo. */
function sampleDays() {
  const options = group(
    'g-jantar',
    'meal_options',
    null,
    [
      choice('o1', 'Opção 1', [item('Arroz', 200, 'g', 900)], range(900)),
      choice('o2', 'Opção 2', [item('Batata', 300, 'g', 936)], range(936)),
      choice('o3', 'Opção 3', [item('Aipim', 250, 'g', 738)], range(738)),
    ],
    range(738, 936),
  );
  return [
    day(
      'd1',
      null,
      'other',
      [meal('m1', 'Café da manhã', [fixed('f1', [item('Ovos', 2, null, 400)], range(400))], range(400)), meal('m2', 'Jantar', [options], range(738, 936))],
      range(1138, 1336),
    ),
  ];
}

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/c']}>
        <Routes>
          <Route path="/" element={<Outlet context={{ client }} />}>
            <Route path="c" element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.updateDietVersion).mockResolvedValue({} as never);
  vi.mocked(api.listEvaluations).mockResolvedValue({ items: [{ id: 'e1' }], total: 1, page: 1, pageSize: 1 } as never);
  vi.mocked(api.getEvaluation).mockResolvedValue(evaluation);
  vi.mocked(api.getAnamnesis).mockResolvedValue({
    client: { id: 'c1', fullName: 'Paciente Exemplo', email: 'p@example.com', birthDate: null, gender: null, phone: null },
    anamnesis: { goals: [], conditions: ['hypertension'], familyHistory: [], medications: [], supplements: [], hormones: [], allergies: 'Camarão', completedAt: null, updatedAt: '2026-10-01T00:00:00.000Z' },
  } as never);
});

afterEach(() => cleanup());

describe('1. opções com % de diferença e alerta', () => {
  it('mostra a diferença de cada opção e o alerta das que passam de 10%', async () => {
    renderWithClient(<DietDaysView days={sampleDays()} />);

    const jantar = screen.getByRole('region', { name: 'Opções completas' });
    expect(within(within(jantar).getByRole('article', { name: 'Opção 2' })).getByText('+4%')).toBeInTheDocument();
    const op3 = within(within(jantar).getByRole('article', { name: 'Opção 3' })).getByText('−18%');
    expect(op3.className).toMatch(/diffWarn/);
    expect(within(within(jantar).getByRole('article', { name: 'Opção 1' })).queryByText(/%/)).not.toBeInTheDocument();

    const alert = screen.getByRole('status', { name: 'Opções com calorias diferentes' });
    expect(alert).toHaveTextContent('1 opção com calorias diferentes da 1ª do bloco (mais de 10%)');
    await userEvent.click(within(alert).getByText(/1 opção com calorias diferentes/));
    expect(alert).toHaveTextContent('Jantar · Opção 3: −18% (738 kcal × 900 kcal da Opção 1)');
  });

  it('sem diferença acima de 10%, não há alerta', () => {
    const days = sampleDays();
    days[0].meals[1].groups[0].choices.pop();
    renderWithClient(<DietDaysView days={days} />);
    expect(screen.queryByRole('status', { name: 'Opções com calorias diferentes' })).not.toBeInTheDocument();
  });
});

describe('3. gráfico de macros por refeição', () => {
  it('desenha uma barra por macro e refeição e traz a tabela com os números', () => {
    renderWithClient(<MealMacroChart day={sampleDays()[0]} />);
    const figure = screen.getByRole('figure', { name: 'Proteína, carboidrato e gordura por refeição' });
    expect(figure.querySelectorAll('path')).toHaveLength(6);
    expect(screen.getByText('Jantar · Proteína: 45 g')).toBeInTheDocument(); // dica ao passar o mouse
    const rows = within(figure).getAllByRole('row').map((r) => r.textContent);
    // range() dos testes: proteína = kcal/20, carbo = kcal/10, gordura = kcal/40; o jantar conta pela Opção 1 (900 kcal)
    expect(rows).toEqual(['RefeiçãoProteínaCarboidratoGordurakcal', 'Café da manhã20 g40 g10 g400', 'Jantar45 g90 g23 g900', 'Total do dia65 g130 g33 g1.300']);
  });
});

describe('2. meta nutricional', () => {
  it('salva a meta digitada, com campo vazio indo como "sem meta"', async () => {
    const onSaved = vi.fn();
    renderWithClient(<NutritionTargetCard clientId="c1" dietId="d1" version={version('draft', sampleDays())} editable onSaved={onSaved} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Meta de calorias (kcal)'), '1300');
    await user.type(screen.getByLabelText('Meta de proteína (g)'), '90,5');
    await user.click(screen.getByRole('button', { name: 'Salvar meta' }));

    await waitFor(() => expect(api.updateDietVersion).toHaveBeenCalledWith('c1', 'd1', 'v-draft', { targetCalories: 1300, targetProteinG: 90.5, targetCarbG: null, targetFatG: null }));
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText('Meta salva.')).toBeInTheDocument();
  });

  it('recusa número inválido sem chamar o servidor', async () => {
    renderWithClient(<NutritionTargetCard clientId="c1" dietId="d1" version={version('draft', sampleDays())} editable />);
    await userEvent.type(screen.getByLabelText('Meta de gordura (g)'), '-5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gordura: informe um número maior ou igual a zero.');
    expect(api.updateDietVersion).not.toHaveBeenCalled();
  });

  it('calcula pela última avaliação e pelo cadastro, e "Aplicar à meta" preenche os campos', async () => {
    renderWithClient(<NutritionTargetCard clientId="c1" dietId="d1" version={version('draft', sampleDays())} editable />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Calcular meta' }));

    expect(await screen.findByText(/Peso e altura da avaliação de 21\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue('64.1');
    expect(screen.getByLabelText('Sexo')).toHaveValue('female');

    await user.selectOptions(screen.getByLabelText('Objetivo'), '-20');
    // Mifflin, mulher, 38 anos, 64,1 kg, 156,5 cm, moderadamente ativa, −20% → 1572 kcal
    expect(screen.getByText(/Metabolismo basal/)).toHaveTextContent('Metabolismo basal 1.268 kcal · Gasto do dia 1.966 kcal · Meta 1.572 kcal');

    await user.click(screen.getByRole('button', { name: 'Aplicar à meta' }));
    expect(screen.getByLabelText('Meta de calorias (kcal)')).toHaveValue('1572');
    expect(screen.getByLabelText('Meta de proteína (g)')).toHaveValue('128');
    expect(screen.getByText('Valores aplicados — clique em "Salvar meta" para gravar.')).toBeInTheDocument();
    expect(api.updateDietVersion).not.toHaveBeenCalled();
  });

  it('versão publicada: mostra a meta e o dia comparado com ela, sem edição', () => {
    const published = { ...version('published', sampleDays()), targetCalories: 1500, targetProteinG: 80, targetCarbG: null, targetFatG: null };
    renderWithClient(<NutritionTargetCard clientId="c1" dietId="d1" version={published} editable={false} />);
    expect(screen.getByText('Meta: Calorias 1.500 kcal · Proteína 80 g')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar meta' })).not.toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveTextContent('1.300 kcal −13%');
    expect(row).toHaveTextContent('65 g −19%');
  });
});

describe('4. ficha do paciente ao lado', () => {
  it('abre com a anamnese e a última avaliação, e fecha', async () => {
    renderWithClient(<PatientSheetButton client={client} />);
    const user = userEvent.setup();
    expect(api.listEvaluations).not.toHaveBeenCalled(); // só busca quando abre

    await user.click(screen.getByRole('button', { name: 'Ficha do paciente' }));
    const sheet = screen.getByRole('complementary', { name: 'Ficha do paciente' });
    expect(within(sheet).getByText(/38 anos · feminino · meta de peso 60 kg · água 2,5 L\/dia/)).toBeInTheDocument();
    expect(await within(sheet).findByText('64,1 kg · 156,5 cm · IMC 26,2')).toBeInTheDocument();
    expect(within(sheet).getByText('Gordura 23,6% · massa magra 49 kg')).toBeInTheDocument();
    expect(await within(sheet).findByText('Camarão')).toBeInTheDocument();
    expect(within(sheet).getByText('Hipertensão')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('complementary', { name: 'Ficha do paciente' })).not.toBeInTheDocument();
  });
});
