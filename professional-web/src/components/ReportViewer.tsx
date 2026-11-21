import { useEffect, useState } from 'react';
import * as api from '../api/endpoints';
import { Button } from './Button';

interface Props {
  clientId: string;
  reportId: string;
  title: string;
  onClose: () => void;
}

/**
 * Mostra o PDF do relatório dentro do painel. O arquivo é baixado como blob e aberto por
 * um endereço local (blob:), assim o navegador exibe o PDF na própria tela em vez de
 * salvar o arquivo, e não depende do servidor permitir ser mostrado dentro do painel.
 */
export function ReportViewer({ clientId, reportId, title, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { url } = await api.getReportDownloadUrl(clientId, reportId);
        const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
        const res = await fetch(`${apiBase}${url}`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setSrc(objectUrl);
      } catch {
        if (!cancelled) setError('Não foi possível abrir o relatório. Tente de novo ou use "Baixar".');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clientId, reportId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 100, display: 'flex', padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 1000,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            {src ? (
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = src;
                  link.download = 'relatorio.pdf';
                  link.click();
                }}
              >
                Baixar
              </Button>
            ) : null}
            <Button size="small" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div role="alert" style={{ color: 'var(--color-danger)', padding: 24 }}>
              {error}
            </div>
          ) : src ? (
            <iframe title={title} src={src} style={{ width: '100%', height: '100%', border: 'none' }} />
          ) : (
            <div style={{ color: 'var(--color-text-secondary)', padding: 24 }}>Abrindo o relatório…</div>
          )}
        </div>
      </div>
    </div>
  );
}
