import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../api/endpoints';
import type { BodyPhoto } from '../../../types/api';
import { photoFileError } from '../../../utils/evaluationPhotoFile';
import { EvaluationPhotosCard } from '../EvaluationPhotosCard';

vi.mock('../../../api/endpoints', () => ({
  uploadEvaluationPhoto: vi.fn(),
  getEvaluationPhotoUrl: vi.fn(),
  deleteEvaluationPhoto: vi.fn(),
}));

const photo = (overrides: Partial<BodyPhoto> = {}): BodyPhoto => ({
  id: 'photo-1',
  angle: 'front',
  contentType: 'image/jpeg',
  capturedAt: null,
  createdAt: '2026-10-13T12:00:00.000Z',
  ...overrides,
});

const jpeg = (name = 'frente.jpg') => new File(['conteúdo'], name, { type: 'image/jpeg' });

function renderCard(photos: BodyPhoto[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <EvaluationPhotosCard clientId="client-1" evaluationId="eval-1" photos={photos} />
    </QueryClientProvider>,
  );
  return invalidate;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.uploadEvaluationPhoto).mockResolvedValue({ id: 'photo-new', angle: 'front' });
  vi.mocked(api.deleteEvaluationPhoto).mockResolvedValue();
  vi.mocked(api.getEvaluationPhotoUrl).mockResolvedValue({ url: '/files/token-abc', expiresAt: '2026-10-13T13:00:00.000Z' });
});

afterEach(() => cleanup());

describe('Fotos da avaliação', () => {
  it('mostra as quatro vistas, vazias, com botão de enviar', () => {
    renderCard();
    for (const label of ['Vista frontal', 'Vista lateral direita', 'Vista posterior', 'Vista lateral esquerda']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Sem foto')).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Enviar foto' })).toHaveLength(4);
    expect(api.getEvaluationPhotoUrl).not.toHaveBeenCalled();
  });

  it('envia a foto escolhida no computador para a vista certa e recarrega a avaliação', async () => {
    const invalidate = renderCard();
    const file = jpeg('costas.jpg');

    await userEvent.upload(screen.getByLabelText('Arquivo da vista posterior'), file);

    await waitFor(() => expect(api.uploadEvaluationPhoto).toHaveBeenCalledWith('client-1', 'eval-1', 'back', file));
    expect(api.deleteEvaluationPhoto).not.toHaveBeenCalled();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['evaluation', 'client-1', 'eval-1'] }));
  });

  it('vista com foto: mostra a imagem e permite trocar — a antiga só é apagada depois que a nova subiu', async () => {
    renderCard([photo()]);

    const image = await screen.findByRole('img', { name: 'Vista frontal' });
    expect(image.getAttribute('src')).toContain('/files/token-abc');
    expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText('Arquivo da vista frontal'), jpeg());

    await waitFor(() => expect(api.deleteEvaluationPhoto).toHaveBeenCalledWith('client-1', 'eval-1', 'photo-1'));
    const uploadOrder = vi.mocked(api.uploadEvaluationPhoto).mock.invocationCallOrder[0];
    const deleteOrder = vi.mocked(api.deleteEvaluationPhoto).mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(deleteOrder);
  });

  it('se o envio falha, avisa e não apaga a foto que estava', async () => {
    vi.mocked(api.uploadEvaluationPhoto).mockRejectedValue(new Error('falhou'));
    renderCard([photo()]);
    await screen.findByRole('img', { name: 'Vista frontal' });

    await userEvent.upload(screen.getByLabelText('Arquivo da vista frontal'), jpeg());

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar a foto. Tente de novo.');
    expect(api.deleteEvaluationPhoto).not.toHaveBeenCalled();
  });

  it('recusa na hora arquivo que não é foto ou é grande demais', async () => {
    expect(photoFileError({ type: 'application/pdf', size: 1000 })).toBe('Formato não aceito. Use uma foto JPG, PNG ou WEBP.');
    expect(photoFileError({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).toBe('A foto tem mais de 10 MB. Escolha um arquivo menor.');
    expect(photoFileError({ type: 'image/webp', size: 10 * 1024 * 1024 })).toBeNull();

    renderCard();
    const pdf = new File(['x'], 'laudo.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Arquivo da vista frontal'), pdf, { applyAccept: false });

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato não aceito');
    expect(api.uploadEvaluationPhoto).not.toHaveBeenCalled();
  });

  it('remover pede confirmação antes de apagar', async () => {
    renderCard([photo()]);
    await screen.findByRole('img', { name: 'Vista frontal' });

    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(api.deleteEvaluationPhoto).not.toHaveBeenCalled();
    expect(screen.getByText(/será apagada desta avaliação/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.deleteEvaluationPhoto).toHaveBeenCalledWith('client-1', 'eval-1', 'photo-1'));
  });

  it('duas fotos da mesma vista: vale a mais recente', async () => {
    renderCard([photo({ id: 'antiga', createdAt: '2026-10-01T12:00:00.000Z' }), photo({ id: 'nova', createdAt: '2026-10-13T12:00:00.000Z' })]);
    await waitFor(() => expect(api.getEvaluationPhotoUrl).toHaveBeenCalledWith('client-1', 'eval-1', 'nova'));
    expect(api.getEvaluationPhotoUrl).not.toHaveBeenCalledWith('client-1', 'eval-1', 'antiga');
  });
});
