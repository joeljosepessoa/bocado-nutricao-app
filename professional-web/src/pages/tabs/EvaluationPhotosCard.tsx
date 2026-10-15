import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api/endpoints';
import type { BodyPhoto } from '../../types/api';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ACCEPTED_PHOTO_TYPES, photoFileError } from '../../utils/evaluationPhotoFile';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

const ANGLES: Array<{ angle: BodyPhoto['angle']; label: string }> = [
  { angle: 'front', label: 'Vista frontal' },
  { angle: 'side_right', label: 'Vista lateral direita' },
  { angle: 'back', label: 'Vista posterior' },
  { angle: 'side_left', label: 'Vista lateral esquerda' },
];

export type PendingPhotos = Partial<Record<BodyPhoto['angle'], File>>;

/**
 * Fotos de uma avaliação que ainda não foi salva: o profissional escolhe os
 * arquivos aqui e eles sobem logo depois que a avaliação é criada.
 */
export function PendingPhotosCard({ files, onChange }: { files: PendingPhotos; onChange: (files: PendingPhotos) => void }) {
  const [error, setError] = useState<string | null>(null);
  // Prévia local das fotos escolhidas — nada sai do computador antes de salvar.
  const previews = useMemo(
    () => Object.fromEntries(Object.entries(files).map(([angle, file]) => [angle, URL.createObjectURL(file as File)])) as Partial<Record<BodyPhoto['angle'], string>>,
    [files],
  );
  useEffect(() => () => Object.values(previews).forEach((url) => URL.revokeObjectURL(url as string)), [previews]);

  function choose(angle: BodyPhoto['angle'], file: File | undefined) {
    if (!file) return;
    const invalid = photoFileError(file);
    setError(invalid);
    if (!invalid) onChange({ ...files, [angle]: file });
  }

  function remove(angle: BodyPhoto['angle']) {
    const next = { ...files };
    delete next[angle];
    onChange(next);
  }

  return (
    <Card title="Fotos">
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Escolha no computador as fotos que você tirou na avaliação (JPG, PNG ou WEBP, até 10 MB cada). Elas são enviadas quando você salvar a
        avaliação.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {ANGLES.map(({ angle, label }) => (
          <SlotFrame
            key={angle}
            label={label}
            imageUrl={previews[angle] ?? null}
            emptyText="Sem foto"
            inputLabel={`Arquivo da ${label.toLowerCase()}`}
            onFile={(file) => choose(angle, file)}
            chooseText={files[angle] ? 'Trocar foto' : 'Escolher foto'}
            onRemove={files[angle] ? () => remove(angle) : undefined}
          />
        ))}
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: 'var(--color-danger)' }}>
          {error}
        </div>
      ) : null}
    </Card>
  );
}

/** Moldura de uma vista: imagem (ou aviso), botão que abre a janela do computador e, se houver foto, "Remover". */
function SlotFrame({
  label,
  imageUrl,
  emptyText,
  inputLabel,
  onFile,
  chooseText,
  onRemove,
  busy = false,
  link,
}: {
  label: string;
  imageUrl: string | null;
  emptyText: string;
  inputLabel: string;
  onFile: (file: File | undefined) => void;
  chooseText: string;
  onRemove?: () => void;
  busy?: boolean;
  link?: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const image = imageUrl ? <img src={imageUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{label}</div>
      <div
        style={{
          aspectRatio: '3 / 4',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
          padding: image ? 0 : 8,
        }}
      >
        {image && link ? (
          <a href={link} target="_blank" rel="noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
            {image}
          </a>
        ) : (
          (image ?? emptyText)
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(',')}
        aria-label={inputLabel}
        style={{ display: 'none' }}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ''; // permite escolher o mesmo arquivo outra vez
        }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" variant={onRemove ? 'secondary' : 'primary'} loading={busy} onClick={() => input.current?.click()}>
          {chooseText}
        </Button>
        {onRemove ? (
          <Button size="small" variant="ghost" disabled={busy} onClick={onRemove}>
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Fotos da avaliação, uma por vista, enviadas do computador. Trocar a foto de
 * uma vista envia a nova e só então apaga a anterior — se o envio falhar, a
 * foto que estava continua lá.
 */
export function EvaluationPhotosCard({ clientId, evaluationId, photos }: { clientId: string; evaluationId: string; photos: BodyPhoto[] }) {
  return (
    <Card title="Fotos">
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Envie do computador as fotos que você tirou na avaliação (JPG, PNG ou WEBP, até 10 MB cada). Só você envia fotos aqui; o paciente
        apenas as vê no app depois que você libera a avaliação.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {ANGLES.map(({ angle, label }) => {
          // Se houver mais de uma foto da mesma vista, vale a mais recente.
          const ofAngle = photos.filter((photo) => photo.angle === angle).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return <PhotoSlot key={angle} clientId={clientId} evaluationId={evaluationId} angle={angle} label={label} photo={ofAngle.at(-1) ?? null} />;
        })}
      </div>
    </Card>
  );
}

function PhotoSlot({
  clientId,
  evaluationId,
  angle,
  label,
  photo,
}: {
  clientId: string;
  evaluationId: string;
  angle: BodyPhoto['angle'];
  label: string;
  photo: BodyPhoto | null;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // O endereço da foto é temporário: pedido de novo a cada abertura da tela.
  const { data: signed, isError: urlFailed } = useQuery({
    queryKey: ['evaluation-photo', evaluationId, photo?.id],
    queryFn: () => api.getEvaluationPhotoUrl(clientId, evaluationId, photo!.id),
    enabled: !!photo,
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['evaluation', clientId, evaluationId] });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const invalid = photoFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadEvaluationPhoto(clientId, evaluationId, angle, file);
      if (photo) await api.deleteEvaluationPhoto(clientId, evaluationId, photo.id);
      await refresh();
    } catch {
      setError('Não foi possível enviar a foto. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!photo) return;
    await api.deleteEvaluationPhoto(clientId, evaluationId, photo.id);
    await refresh();
  }

  const imageUrl = photo && signed ? `${API_BASE_URL}${signed.url}` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SlotFrame
        label={label}
        imageUrl={imageUrl}
        link={imageUrl ?? undefined}
        emptyText={photo ? (urlFailed ? 'Não foi possível carregar a foto.' : 'Carregando foto…') : 'Sem foto'}
        inputLabel={`Arquivo da ${label.toLowerCase()}`}
        onFile={(file) => void handleFile(file)}
        chooseText={photo ? 'Trocar foto' : 'Enviar foto'}
        onRemove={photo ? () => setConfirmRemove(true) : undefined}
        busy={busy}
      />
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: 'var(--color-danger)' }}>
          {error}
        </div>
      ) : null}
      {confirmRemove ? (
        <ConfirmDialog
          title="Remover foto"
          description={`A foto da ${label.toLowerCase()} será apagada desta avaliação. Não dá para desfazer.`}
          danger
          onConfirm={handleRemove}
          onClose={() => setConfirmRemove(false)}
        />
      ) : null}
    </div>
  );
}
