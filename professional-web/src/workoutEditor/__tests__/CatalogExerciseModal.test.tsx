import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { Exercise } from '../../types/api';
import { ExercisePickerModal } from '../../workoutAssistant/ExercisePickerModal';
import { CatalogExerciseModal } from '../CatalogExerciseModal';

vi.mock('../../api/endpoints', () => ({
  listExercises: vi.fn(),
  createExercise: vi.fn(),
  fetchExerciseMedia: vi.fn(),
}));

const exercise = (id: string, name: string, overrides: Partial<Exercise> = {}): Exercise => ({
  id,
  name,
  type: 'strength',
  muscleGroup: 'Peitoral',
  equipment: 'Barra',
  videoUrl: null,
  imageUrl: null,
  scope: 'global',
  ...overrides,
});

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listExercises).mockResolvedValue([exercise('ex-1', 'Supino reto')]);
});

describe('catálogo de exercícios no editor de treino — cadastrar o que falta', () => {
  it('exercício fora do catálogo é cadastrado ali mesmo (particular, sem GIF) e já fica selecionado para o treino', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.createExercise).mockResolvedValue(exercise('ex-novo', 'Crucifixo inclinado', { scope: 'private', muscleGroup: 'Peitoral superior', equipment: 'Halteres' }));
    wrap(<CatalogExerciseModal title="Adicionar exercício" confirmLabel="Adicionar" onClose={vi.fn()} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText(/Buscar por nome, grupo muscular ou equipamento/), 'Crucifixo inclinado');
    // A busca não achou o exercício: nada de duplicado no catálogo.
    vi.mocked(api.listExercises).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: /Cadastrar novo exercício/ }));

    const form = screen.getByRole('form', { name: 'Cadastrar novo exercício' });
    // O nome já vem do que foi buscado.
    expect(within(form).getByLabelText('Nome do exercício')).toHaveValue('Crucifixo inclinado');
    await user.type(within(form).getByLabelText('Grupo muscular'), ' Peitoral superior ');
    await user.type(within(form).getByLabelText('Equipamento'), 'Halteres');
    await user.selectOptions(within(form).getByLabelText('Tipo'), 'Força / musculação');
    await user.type(within(form).getByLabelText(/Como executar/), 'Banco a 30°, abra os braços até a linha dos ombros.');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar exercício' }));

    await waitFor(() =>
      expect(api.createExercise).toHaveBeenCalledWith({
        name: 'Crucifixo inclinado',
        type: 'strength',
        scope: 'private',
        muscleGroup: 'Peitoral superior',
        equipment: 'Halteres',
        instructions: 'Banco a 30°, abra os braços até a linha dos ombros.',
      }),
    );
    // De volta à lista, com o novo exercício selecionado: o id usado no treino é o que a API devolveu.
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Cadastrar novo exercício' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('ex-novo'));
  });

  it('não cadastra duplicado: nome igual a um do catálogo (a menos de acento e caixa) manda selecionar o existente', async () => {
    const user = userEvent.setup();
    wrap(<CatalogExerciseModal title="Adicionar exercício" confirmLabel="Adicionar" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Cadastrar novo exercício/ }));
    const form = screen.getByRole('form', { name: 'Cadastrar novo exercício' });
    await user.type(within(form).getByLabelText('Nome do exercício'), 'SUPINO RETO');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar exercício' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(/Já existe um exercício com esse nome/);
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it('nome em branco não é enviado; "Voltar à lista" não cadastra nada', async () => {
    const user = userEvent.setup();
    wrap(<CatalogExerciseModal title="Adicionar exercício" confirmLabel="Adicionar" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Cadastrar novo exercício/ }));
    const form = screen.getByRole('form', { name: 'Cadastrar novo exercício' });
    await user.click(within(form).getByRole('button', { name: 'Cadastrar exercício' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Informe o nome do exercício.');

    await user.click(within(form).getByRole('button', { name: 'Voltar à lista' }));
    expect(screen.queryByRole('form', { name: 'Cadastrar novo exercício' })).not.toBeInTheDocument();
    expect(api.createExercise).not.toHaveBeenCalled();
    // A lista do catálogo continua lá, com o que já existia.
    expect(await screen.findByRole('option', { name: /Supino reto/ })).toBeInTheDocument();
  });
});

describe('Assistente de Treino — exercício que a IA leu e não existe no catálogo', () => {
  it('o cadastro abre com o nome e o grupo muscular lidos do texto; quem cadastra é o profissional', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    vi.mocked(api.listExercises).mockResolvedValue([]);
    vi.mocked(api.createExercise).mockResolvedValue(exercise('ex-ia', 'Remada cavalinho', { scope: 'private', muscleGroup: 'Costas', equipment: null }));
    wrap(
      <ExercisePickerModal
        title="Selecionar exercício do catálogo"
        confirmLabel="Usar este exercício"
        initialSearch="Remada cavalinho"
        suggestedMuscleGroup="Costas"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Nenhum exercício encontrado no catálogo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cadastrar novo exercício/ }));
    const form = screen.getByRole('form', { name: 'Cadastrar novo exercício' });
    expect(within(form).getByLabelText('Nome do exercício')).toHaveValue('Remada cavalinho');
    expect(within(form).getByLabelText('Grupo muscular')).toHaveValue('Costas');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar exercício' }));

    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith({ name: 'Remada cavalinho', type: 'strength', scope: 'private', muscleGroup: 'Costas' }));
    await user.click(await screen.findByRole('button', { name: 'Usar este exercício' }));
    expect(onPick).toHaveBeenCalledWith({ id: 'ex-ia', name: 'Remada cavalinho', muscleGroup: 'Costas', equipment: null, imageUrl: null });
  });
});
