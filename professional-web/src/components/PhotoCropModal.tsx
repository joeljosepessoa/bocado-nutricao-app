import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { croppedFileName, cropPixels, FULL_RECT, moveRect, resizeRect, type Corner, type CropRect } from '../utils/photoCrop';

type Drag = { kind: 'move' } | { kind: 'resize'; corner: Corner };

/** Gira a imagem em passos de 90° num canvas e devolve o canvas (base do recorte e da prévia). */
function rotatedCanvas(image: HTMLImageElement, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const canvas = document.createElement('canvas');
  const sideways = turns % 2 === 1;
  canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
  canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas;
}

/**
 * Ajustar foto: mostra a foto com um quadro de recorte (arrasta para mover, cantos para redimensionar),
 * girar 90° e restaurar. "Aplicar" gera uma nova foto JPG só com a parte escolhida — a original não é
 * alterada no computador; quem chama decide o que fazer com o arquivo novo (ex.: trocar a foto).
 */
export function PhotoCropModal({
  source,
  fileName,
  title = 'Ajustar foto',
  onCancel,
  onApply,
}: {
  /** Arquivo escolhido no computador ou endereço da foto já salva. */
  source: Blob | string;
  fileName: string;
  title?: string;
  onCancel: () => void;
  onApply: (file: File) => Promise<void> | void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [rect, setRect] = useState<CropRect>(FULL_RECT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ mode: Drag; startX: number; startY: number; startRect: CropRect } | null>(null);

  // Carrega a foto (arquivo local ou baixada do servidor) como imagem.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => !cancelled && setImage(img);
        img.onerror = () => !cancelled && setLoadError('Não foi possível abrir a foto para ajustar.');
        img.src = objectUrl;
      } catch {
        if (!cancelled) setLoadError('Não foi possível abrir a foto para ajustar.');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  // Prévia girada (o quadro de recorte é sempre sobre a foto já girada).
  const preview = useMemo(() => {
    if (!image) return null;
    const canvas = rotatedCanvas(image, turns);
    let url = image.src;
    try {
      url = canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      // sem canvas: mostra a foto como veio
    }
    return { url, canvas };
  }, [image, turns]);

  // Girar recomeça o quadro na foto inteira.
  const turn = (delta: number) => {
    setTurns((t) => t + delta);
    setRect(FULL_RECT);
  };

  function startDrag(event: ReactPointerEvent, mode: Drag) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { mode, startX: event.clientX, startY: event.clientY, startRect: rect };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const current = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!current || !box || box.width === 0 || box.height === 0) return;
    const dx = (event.clientX - current.startX) / box.width;
    const dy = (event.clientY - current.startY) / box.height;
    setRect(current.mode.kind === 'move' ? moveRect(current.startRect, dx, dy) : resizeRect(current.startRect, current.mode.corner, dx, dy));
  }

  const endDrag = () => {
    drag.current = null;
  };

  async function apply() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const { sx, sy, sw, sh, outW, outH } = cropPixels(rect, preview.canvas.width, preview.canvas.height);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('sem canvas');
      ctx.drawImage(preview.canvas, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('sem imagem');
      await onApply(new File([blob], croppedFileName(fileName), { type: 'image/jpeg' }));
    } catch {
      setError('Não foi possível aplicar o ajuste. Tente de novo.');
      setSaving(false);
    }
  }

  const handle = (corner: Corner, style: React.CSSProperties) => (
    <span
      role="presentation"
      onPointerDown={(e) => startDrag(e, { kind: 'resize', corner })}
      style={{ position: 'absolute', width: 18, height: 18, background: '#fff', border: '2px solid var(--color-primary)', borderRadius: 4, touchAction: 'none', ...style }}
    />
  );
  const changed = turns !== 0 || rect.x !== 0 || rect.y !== 0 || rect.w !== 1 || rect.h !== 1;

  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void apply()} loading={saving} disabled={!preview || !changed}>
            Aplicar ajuste
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Arraste o quadro para escolher a parte da foto e puxe os cantos para aumentar ou diminuir. O que ficar fora do quadro é cortado.
        </div>
        {loadError ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {loadError}
          </div>
        ) : !preview ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando foto…</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--color-bg)', borderRadius: 8, padding: 8 }}>
            <div
              ref={frame}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ position: 'relative', display: 'inline-block', lineHeight: 0, userSelect: 'none', touchAction: 'none' }}
            >
              <img src={preview.url} alt="Foto para ajustar" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh' }} />
              <div
                aria-label="Área do recorte"
                onPointerDown={(e) => startDrag(e, { kind: 'move' })}
                style={{
                  position: 'absolute',
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  border: '2px solid var(--color-primary)',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  cursor: 'move',
                  touchAction: 'none',
                }}
              >
                {handle('nw', { left: -9, top: -9, cursor: 'nwse-resize' })}
                {handle('ne', { right: -9, top: -9, cursor: 'nesw-resize' })}
                {handle('sw', { left: -9, bottom: -9, cursor: 'nesw-resize' })}
                {handle('se', { right: -9, bottom: -9, cursor: 'nwse-resize' })}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" variant="secondary" onClick={() => turn(-1)} disabled={!preview || saving}>
            ↺ Girar
          </Button>
          <Button size="small" variant="secondary" onClick={() => turn(1)} disabled={!preview || saving}>
            ↻ Girar
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setTurns(0);
              setRect(FULL_RECT);
            }}
            disabled={!changed || saving}
          >
            Restaurar
          </Button>
        </div>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
