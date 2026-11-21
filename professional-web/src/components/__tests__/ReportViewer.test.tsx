import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { ReportViewer } from '../ReportViewer';

vi.mock('../../api/endpoints', () => ({ getReportDownloadUrl: vi.fn() }));

describe('ReportViewer', () => {
  beforeEach(() => {
    vi.mocked(api.getReportDownloadUrl).mockResolvedValue({ url: '/files/token', expiresAt: '2026-11-21T00:00:00Z' } as never);
    URL.createObjectURL = vi.fn(() => 'blob:relatorio');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('baixa o PDF e mostra na tela, dentro do painel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(<ReportViewer clientId="c1" reportId="r1" title="Relatório cliente" onClose={onClose} />);

    expect(screen.getByText('Abrindo o relatório…')).toBeInTheDocument();
    const frame = await screen.findByTitle('Relatório cliente');
    expect(frame.getAttribute('src')).toBe('blob:relatorio');
    expect(api.getReportDownloadUrl).toHaveBeenCalledWith('c1', 'r1');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/files\/token$/);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('avisa quando não consegue abrir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<ReportViewer clientId="c1" reportId="r1" title="Relatório" onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o relatório');
    vi.unstubAllGlobals();
  });
});
