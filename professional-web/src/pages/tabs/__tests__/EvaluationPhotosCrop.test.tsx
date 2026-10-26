import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../api/endpoints';
import { EvaluationPhotosCard, PendingPhotosCard, type PendingPhotos } from '../EvaluationPhotosCard';

vi.mock('../../../api/endpoints', () => ({
  uploadEvaluationPhoto: vi.fn(),
  getEvaluationPhotoUrl: vi.fn(),
  deleteEvaluationPhoto: vi.fn(),
}));

// A janela de recorte usa canvas (não existe no ambiente de teste): aqui ela só devolve um arquivo "recortado".
const cropped = new File(['recortada'], 'front-recorte.jpg', { type: 'image/jpeg' });
vi.mock('../../../components/PhotoCropModal', () => ({
  PhotoCropModal: ({ title, source, onApply, onCancel }: { title: string; source: Blob | string; onApply: (f: File) => void; onCancel: () => void }) => (
    <div role="dialog" aria-label={title}>
      <span>origem: {typeof source === 'string' ? source : 'arquivo'}</span>
      <button onClick={() => onApply(cropped)}>Aplicar ajuste</button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.uploadEvaluationPhoto).mockResolvedValue({ id: 'photo-new', angle: 'front' });
  vi.mocked(api.deleteEvaluationPhoto).mockResolvedValue();
  vi.mocked(api.getEvaluationPhotoUrl).mockResolvedValue({ url: '/files/token-abc', expiresAt: '2026-10-26T13:00:00.000Z' });
});

describe('Ajustar foto (recortar/girar)', () => {
  it('foto já salva: "Ajustar" abre a foto e o recorte entra no lugar da anterior', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EvaluationPhotosCard
          clientId="client-1"
          evaluationId="eval-1"
          photos={[{ id: 'photo-1', angle: 'front', contentType: 'image/jpeg', capturedAt: null, createdAt: '2026-10-13T12:00:00.000Z' }]}
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Ajustar' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajustar — vista frontal' });
    expect(within(dialog).getByText(/origem: .*\/files\/token-abc/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar ajuste' }));

    await waitFor(() => expect(api.uploadEvaluationPhoto).toHaveBeenCalledWith('client-1', 'eval-1', 'front', cropped));
    expect(api.deleteEvaluationPhoto).toHaveBeenCalledWith('client-1', 'eval-1', 'photo-1');
  });

  it('vista sem foto não tem "Ajustar"', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <EvaluationPhotosCard clientId="client-1" evaluationId="eval-1" photos={[]} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Ajustar' })).not.toBeInTheDocument();
  });

  it('avaliação nova: ajusta o arquivo escolhido antes de salvar (nada é enviado ainda)', async () => {
    const user = userEvent.setup();
    let latest: PendingPhotos = {};
    function Harness() {
      const [files, setFiles] = useState<PendingPhotos>({ front: new File(['x'], 'frente.png', { type: 'image/png' }) });
      latest = files;
      return <PendingPhotosCard files={files} onChange={setFiles} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Ajustar' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Ajustar — vista frontal' })).getByRole('button', { name: 'Aplicar ajuste' }));
    await waitFor(() => expect(latest.front).toBe(cropped));
    expect(api.uploadEvaluationPhoto).not.toHaveBeenCalled();
  });
});
