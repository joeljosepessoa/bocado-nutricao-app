/** Os mesmos limites que o servidor aplica às fotos de avaliação — conferidos antes de enviar, para o aviso sair na hora. */
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

export function photoFileError(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) return 'Formato não aceito. Use uma foto JPG, PNG ou WEBP.';
  if (file.size > MAX_PHOTO_SIZE_BYTES) return 'A foto tem mais de 10 MB. Escolha um arquivo menor.';
  return null;
}
