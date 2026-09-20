const API_MEDIA_PREFIX = '/exercise-media/';

export interface ExerciseMediaSource {
  uri: string;
  headers?: Record<string, string>;
  /** iOS: o conteúdo é endereçado por hash (imutável), então pode reaproveitar o cache. */
  cache: 'force-cache';
}

/**
 * Decide como o app carrega a demonstração de um exercício:
 * - caminho `/exercise-media/<hash>` (servido pela nossa API): resolve contra
 *   a URL base e anexa o token — a rota é autenticada;
 * - URL absoluta http(s) informada por um profissional: carrega direto, SEM
 *   token (o token só viaja para a nossa própria API);
 * - qualquer outra coisa (inclui `//host/...`): não carrega.
 * Função pura (sem react-native) para ser testável em Jest/node.
 */
export function resolveExerciseMediaSource(
  imageUrl: string | null | undefined,
  apiBaseUrl: string,
  accessToken: string | null,
): ExerciseMediaSource | null {
  if (!imageUrl) return null;

  if (imageUrl.startsWith(API_MEDIA_PREFIX) && imageUrl.length > API_MEDIA_PREFIX.length) {
    const base = apiBaseUrl.replace(/\/+$/, '');
    return {
      uri: `${base}${imageUrl}`,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      cache: 'force-cache',
    };
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return { uri: imageUrl, cache: 'force-cache' };
  }

  return null;
}
