import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { FoodPickerModal } from '../../dietAssistant/FoodPickerModal';

vi.mock('../../api/endpoints', () => ({
  listFoods: vi.fn(),
  createFood: vi.fn(),
}));

describe('Escolher alimento na dieta', () => {
  beforeEach(() => {
    vi.mocked(api.listFoods).mockReset().mockResolvedValue([]);
    vi.mocked(api.createFood).mockReset();
  });

  it('cadastra um alimento novo ali mesmo e já escolhe', async () => {
    vi.mocked(api.createFood).mockResolvedValue({ id: 'n1', name: 'Tapioca recheada', scope: 'private', baseUnit: 'g', kcalPer100: 200, proteinGPer100: 5, carbGPer100: 40, fatGPer100: 3, fiberGPer100: null });
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FoodPickerModal initialSearch="Tapioca recheada" onSelect={onSelect} onClose={onClose} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Use “Cadastrar novo alimento”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar novo alimento' }));
    expect(screen.getByLabelText('Nome do alimento')).toHaveValue('Tapioca recheada');
    await userEvent.type(screen.getByLabelText('Calorias'), '200');
    await userEvent.type(screen.getByLabelText('Proteína'), '5');
    await userEvent.type(screen.getByLabelText('Carboidrato'), '40');
    await userEvent.type(screen.getByLabelText('Gordura'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: 'n1', name: 'Tapioca recheada' }));
    expect(onClose).toHaveBeenCalled();
  });
});
