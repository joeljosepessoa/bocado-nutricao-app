import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { FoodDetails, FoodLibraryItem, FoodLibraryPage as Page } from '../../types/api';
import { FoodLibraryPage } from '../FoodLibraryPage';

vi.mock('../../api/endpoints', () => ({
  listFoodLibrary: vi.fn(),
  getFoodDetails: vi.fn(),
  createFood: vi.fn(),
  updateFood: vi.fn(),
  deleteFood: vi.fn(),
}));

const item = (over: Partial<FoodLibraryItem> = {}): FoodLibraryItem => ({
  id: 'taco-1',
  name: 'Arroz, integral, cozido',
  origin: 'taco',
  tacoNumber: 1,
  foodGroup: 'Cereais e derivados',
  preparation: 'cozido',
  baseUnit: 'g',
  kcalPer100: 123.5,
  proteinGPer100: 2.59,
  carbGPer100: 25.8,
  fatGPer100: 1,
  fiberGPer100: 2.75,
  sodiumMgPer100: 1.2,
  householdMeasures: 0,
  pending: false,
  canEdit: false,
  ...over,
});

const page = (over: Partial<Page> = {}): Page => ({
  items: [item(), item({ id: 'mine-1', name: 'Pão de queijo da padaria', origin: 'mine', tacoNumber: null, foodGroup: null, canEdit: true, householdMeasures: 1 })],
  total: 2,
  page: 1,
  pageSize: 40,
  groups: [
    { name: 'Cereais e derivados', count: 1 },
    { name: 'Frutas e derivados', count: 0 },
  ],
  withoutGroup: 1,
  origins: { all: 2, taco: 1, mine: 1, shared: 0 },
  ...over,
});

const details = (over: Partial<FoodDetails> = {}): FoodDetails => ({
  ...item(),
  sourceEdition: 'TACO 4ª edição',
  unitConversions: [{ unit: 'tablespoon', gramsEquivalent: 25 }],
  sections: [
    {
      title: 'Composição',
      rows: [
        { key: 'energia_kcal', label: 'Energia', unit: 'kcal', value: 123.5, status: 'valor' },
        { key: 'proteina', label: 'Proteína', unit: 'g', value: 2.59, status: 'valor' },
      ],
    },
    { title: 'Vitaminas', rows: [{ key: 'niacina', label: 'Niacina (B3)', unit: 'mg', value: null, status: 'traco' }] },
  ],
  usage: { patients: 2, dietItems: 3, templates: 0 },
  canDelete: false,
  ...over,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FoodLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Tela Alimentos', () => {
  beforeEach(() => {
    vi.mocked(api.listFoodLibrary).mockReset().mockResolvedValue(page());
    vi.mocked(api.getFoodDetails).mockReset().mockResolvedValue(details());
    vi.mocked(api.createFood).mockReset();
  });

  it('lista TACO e meus alimentos com as contagens por origem', async () => {
    renderPage();
    expect(await screen.findByText('Arroz, integral, cozido')).toBeInTheDocument();
    expect(screen.getByText('TACO nº 1')).toBeInTheDocument();
    expect(screen.getByText('Meu alimento')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meus alimentos (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /outros profissionais/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'TACO (1)' }));
    await waitFor(() => expect(api.listFoodLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ origin: 'taco', group: '' })));
  });

  it('ficha: calcula a porção em medida caseira, mostra marcador e oferece duplicar a TACO', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('row', { name: 'Abrir Arroz, integral, cozido' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('TACO nº 1')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Tr')).toHaveLength(2); // na tabela e na legenda
    expect(within(dialog).getByText(/na dieta de 2 pacientes/)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Quantidade da porção'));
    await userEvent.type(within(dialog).getByLabelText('Quantidade da porção'), '2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Medida da porção'), 'colher(es) de sopa');
    expect(within(dialog).getByText('= 50 g')).toBeInTheDocument();
    // 2 colheres = 50 g → metade de 123,5 kcal
    expect(within(dialog).getByText('62 kcal')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar como meu alimento' }));
    expect(await screen.findByLabelText('Nome do alimento')).toHaveValue('Arroz, integral, cozido (meu)');
  });

  it('cadastra alimento próprio', async () => {
    vi.mocked(api.createFood).mockResolvedValue({ id: 'new', name: 'Bolo de cenoura da vó', scope: 'private', baseUnit: 'g', kcalPer100: 300, proteinGPer100: 4, carbGPer100: 50, fatGPer100: 10, fiberGPer100: null });
    vi.mocked(api.getFoodDetails).mockResolvedValue(details({ id: 'new', name: 'Bolo de cenoura da vó', origin: 'mine', tacoNumber: null, canEdit: true, canDelete: true }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cadastrar alimento' }));
    await userEvent.type(screen.getByLabelText('Nome do alimento'), 'Bolo de cenoura da vó');
    await userEvent.type(screen.getByLabelText('Calorias'), '300');
    await userEvent.type(screen.getByLabelText('Proteína'), '4');
    await userEvent.type(screen.getByLabelText('Carboidrato'), '50');
    await userEvent.type(screen.getByLabelText('Gordura'), '10');
    await userEvent.click(screen.getByRole('button', { name: '+ Medida caseira' }));
    await userEvent.selectOptions(screen.getByLabelText('Medida 1'), 'fatia(s)');
    await userEvent.type(screen.getByLabelText('Gramas da medida 1'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bolo de cenoura da vó', kcalPer100: 300, unitConversions: [{ unit: 'slice', gramsEquivalent: 60 }] }),
      ),
    );
    expect(await screen.findByText('“Bolo de cenoura da vó” cadastrado em Meus alimentos.')).toBeInTheDocument();
  });
});
