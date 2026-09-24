import { PHOTO_ANGLE_LABELS, resolvePhotoSource } from '../reportPhoto';

describe('resolvePhotoSource', () => {
  it('junta a base da API com o caminho assinado, sem header de autenticação (rota pública)', () => {
    const result = resolvePhotoSource('/files/abc.def.ghi', 'https://api.example.com');
    expect(result).toEqual({ uri: 'https://api.example.com/files/abc.def.ghi' });
  });

  it('remove barra(s) finais da base antes de concatenar', () => {
    const result = resolvePhotoSource('/files/token', 'https://api.example.com/');
    expect(result.uri).toBe('https://api.example.com/files/token');
  });
});

describe('PHOTO_ANGLE_LABELS', () => {
  it('tem rótulo em português pros 4 ângulos possíveis', () => {
    expect(PHOTO_ANGLE_LABELS.front).toBe('Frente');
    expect(PHOTO_ANGLE_LABELS.side_right).toBe('Lado direito');
    expect(PHOTO_ANGLE_LABELS.back).toBe('Costas');
    expect(PHOTO_ANGLE_LABELS.side_left).toBe('Lado esquerdo');
  });
});
