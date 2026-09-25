import { ExercisePreview } from './ExercisePreview';

export const GIF_UNAVAILABLE_TEXT = 'GIF não disponível para este exercício.';

interface Props {
  exercise: { id: string; name: string; muscleGroup: string | null; equipment: string | null; imageUrl?: string | null };
}

/**
 * GIF do PRÓPRIO exercício do catálogo (Exercise.imageUrl) — sem imageUrl,
 * avisa; nunca cai para um GIF genérico ou de outro exercício. A `key` pelo
 * id garante que, ao trocar o exercício, a mídia anterior não permaneça.
 */
export function ExerciseGif({ exercise }: Props) {
  if (!exercise.imageUrl) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{GIF_UNAVAILABLE_TEXT}</div>;
  }
  return <ExercisePreview key={exercise.id} compact exercise={{ ...exercise, imageUrl: exercise.imageUrl }} />;
}
