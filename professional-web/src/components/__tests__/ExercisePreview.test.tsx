import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { ExercisePreview } from '../ExercisePreview';

vi.mock('../../api/endpoints', () => ({ fetchExerciseMedia: vi.fn() }));

const base = { name: 'Agachamento livre', muscleGroup: 'Quadríceps, glúteos', equipment: 'Barra e anilhas' };

function renderPreview(imageUrl: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExercisePreview exercise={{ ...base, imageUrl }} />
    </QueryClientProvider>,
  );
}

describe('ExercisePreview', () => {
  beforeEach(() => {
    vi.mocked(api.fetchExerciseMedia).mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:mock-gif');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('mostra nome, músculo e equipamento', () => {
    renderPreview(null);
    expect(screen.getByText('Agachamento livre')).toBeInTheDocument();
    expect(screen.getByText('Quadríceps, glúteos · Barra e anilhas')).toBeInTheDocument();
  });

  it('sem imageUrl: não busca nada e avisa que não há demonstração', () => {
    renderPreview(null);
    expect(screen.getByText('Sem demonstração para este exercício')).toBeInTheDocument();
    expect(api.fetchExerciseMedia).not.toHaveBeenCalled();
  });

  it('caminho da API: busca o GIF autenticado UMA vez e exibe a imagem', async () => {
    vi.mocked(api.fetchExerciseMedia).mockResolvedValue(new Blob(['gif'], { type: 'image/gif' }));
    renderPreview(`/exercise-media/${'a'.repeat(64)}`);

    const img = await screen.findByAltText('Demonstração: Agachamento livre');
    expect(img).toHaveAttribute('src', 'blob:mock-gif');
    expect(api.fetchExerciseMedia).toHaveBeenCalledTimes(1);
    expect(api.fetchExerciseMedia).toHaveBeenCalledWith(`/exercise-media/${'a'.repeat(64)}`);
  });

  it('URL externa: exibe direto, sem chamar a API (o token nunca vai para terceiros)', () => {
    renderPreview('https://cdn.example/agachamento.gif');
    expect(screen.getByAltText('Demonstração: Agachamento livre')).toHaveAttribute('src', 'https://cdn.example/agachamento.gif');
    expect(api.fetchExerciseMedia).not.toHaveBeenCalled();
  });

  it('URL suspeita (//host): não busca e não exibe', () => {
    renderPreview('//evil.example/exercise-media/x');
    expect(api.fetchExerciseMedia).not.toHaveBeenCalled();
    expect(screen.getByText('Sem demonstração para este exercício')).toBeInTheDocument();
  });

  it('falha ao baixar: mostra mensagem em vez de quebrar a tela', async () => {
    vi.mocked(api.fetchExerciseMedia).mockRejectedValue(new Error('rede'));
    renderPreview(`/exercise-media/${'b'.repeat(64)}`);
    await waitFor(() => expect(screen.getByText('Não foi possível carregar a demonstração.')).toBeInTheDocument());
  });
});
