import { useRef, useState } from 'react';
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

/**
 * Fotos da avaliação, uma por vista, enviadas do computador. Trocar a foto de
 * uma vista envia a nova e só então apaga a anterior — se o envio falhar, a
 * foto que estava continua lá.
 */
export function EvaluationPhotosCard({ clientId, evaluationId, photos }: { clientId: string; evaluationId: string; photos: BodyPhoto[] }) {
  return (
    <Card title="Fotos">
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Envie do computador as fotos do paciente para acompanhar a evolução (JPG, PNG ou WEBP, até 10 MB cada). O paciente passa a vê-las
        quando a avaliação é liberada.
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
  const input = useRef<HTMLInputElement | null>(null);
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
      if (input.current) input.current.value = ''; // permite escolher o mesmo arquivo outra vez
    }
  }

  async function handleRemove() {
    if (!photo) return;
    await api.deleteEvaluationPhoto(clientId, evaluationId, photo.id);
    await refresh();
  }

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
          padding: photo && signed ? 0 : 8,
        }}
      >
        {photo && signed ? (
          <a href={`${API_BASE_URL}${signed.url}`} target="_blank" rel="noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
            <img src={`${API_BASE_URL}${signed.url}`} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </a>
        ) : photo ? (
          urlFailed ? 'Não foi possível carregar a foto.' : 'Carregando foto…'
        ) : (
          'Sem foto'
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(',')}
        aria-label={`Arquivo da ${label.toLowerCase()}`}
        style={{ display: 'none' }}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" variant={photo ? 'secondary' : 'primary'} loading={busy} onClick={() => input.current?.click()}>
          {photo ? 'Trocar foto' : 'Enviar foto'}
        </Button>
        {photo ? (
          <Button size="small" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
            Remover
          </Button>
        ) : null}
      </div>
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
