import type { PhotoAngle } from '../types/api';

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: 'Frente',
  side_right: 'Lado direito',
  back: 'Costas',
  side_left: 'Lado esquerdo',
};

/**
 * `/files/:token` é pública (o próprio token já autoriza — ver
 * StorageService no backend), então a foto nunca precisa de header de
 * Authorization, diferente de `/exercise-media/`. Função pura (sem
 * react-native) pra ser testável em Jest/node, mesmo padrão de
 * src/media/exerciseMedia.ts.
 */
export function resolvePhotoSource(signedUrlPath: string, apiBaseUrl: string): { uri: string } {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return { uri: `${base}${signedUrlPath}` };
}
