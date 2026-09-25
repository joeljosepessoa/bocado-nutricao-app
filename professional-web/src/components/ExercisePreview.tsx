import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { describeExercise, isApiMediaPath, isExternalImageUrl } from '../lib/exerciseMedia';
import type { Exercise } from '../types/api';

type PreviewExercise = Pick<Exercise, 'name' | 'muscleGroup' | 'equipment' | 'imageUrl'>;

const frame: React.CSSProperties = {
  aspectRatio: '16 / 9',
  width: '100%',
  background: '#fcfcff',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-secondary, #6b7a72)',
  fontSize: 13,
  overflow: 'hidden',
};

/**
 * Baixa o GIF só quando o componente é montado (i.e., para o exercício
 * selecionado) — nunca a lista inteira. O blob vem da API autenticada e o
 * react-query o mantém em memória por alguns minutos, então reselecionar
 * o mesmo exercício não baixa de novo.
 */
function useApiMedia(imageUrl: string | null) {
  const enabled = isApiMediaPath(imageUrl);
  const query = useQuery({
    queryKey: ['exercise-media', imageUrl],
    queryFn: () => api.fetchExerciseMedia(imageUrl as string),
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const objectUrl = useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  return { enabled, objectUrl, loading: enabled && query.isLoading, failed: enabled && query.isError };
}

/** `compact`: só a mídia, em tamanho reduzido — para listas onde o nome já aparece ao lado. */
export function ExercisePreview({ exercise, compact = false }: { exercise: PreviewExercise; compact?: boolean }) {
  const media = useApiMedia(exercise.imageUrl);
  const external = isExternalImageUrl(exercise.imageUrl) ? exercise.imageUrl : null;
  const detail = describeExercise(exercise);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(compact ? { width: 220, maxWidth: '100%' } : {}) }}
      data-testid="exercise-preview"
    >
      <div style={frame}>
        {media.loading ? (
          <span>Carregando demonstração…</span>
        ) : media.failed ? (
          <span>Não foi possível carregar a demonstração.</span>
        ) : media.objectUrl || external ? (
          <img
            src={media.objectUrl ?? external ?? undefined}
            alt={`Demonstração: ${exercise.name}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span>Sem demonstração para este exercício</span>
        )}
      </div>
      {compact ? null : (
        <div>
          <div style={{ fontWeight: 600 }}>{exercise.name}</div>
          {detail ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #6b7a72)' }}>{detail}</div> : null}
        </div>
      )}
    </div>
  );
}
