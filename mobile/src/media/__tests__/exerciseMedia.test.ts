import { resolveExerciseMediaSource } from '../exerciseMedia';

const HASH = 'a'.repeat(64);
const BASE = 'https://api.bocado.example';

describe('resolveExerciseMediaSource', () => {
  it('caminho da nossa API: resolve contra a base e envia o token', () => {
    expect(resolveExerciseMediaSource(`/exercise-media/${HASH}`, BASE, 'tok')).toEqual({
      uri: `${BASE}/exercise-media/${HASH}`,
      headers: { Authorization: 'Bearer tok' },
      cache: 'force-cache',
    });
  });

  it('tolera barra final na base', () => {
    expect(resolveExerciseMediaSource(`/exercise-media/${HASH}`, `${BASE}/`, 'tok')?.uri).toBe(
      `${BASE}/exercise-media/${HASH}`,
    );
  });

  it('sem token disponível: não inventa cabeçalho', () => {
    expect(resolveExerciseMediaSource(`/exercise-media/${HASH}`, BASE, null)?.headers).toBeUndefined();
  });

  it('URL externa absoluta: carrega direto e NUNCA envia o token', () => {
    const source = resolveExerciseMediaSource('https://cdn.example/x.gif', BASE, 'tok');
    expect(source?.uri).toBe('https://cdn.example/x.gif');
    expect(source?.headers).toBeUndefined();
  });

  it('não carrega valores suspeitos ou vazios', () => {
    expect(resolveExerciseMediaSource('//evil.example/exercise-media/x', BASE, 'tok')).toBeNull();
    expect(resolveExerciseMediaSource('/outra-rota/x', BASE, 'tok')).toBeNull();
    expect(resolveExerciseMediaSource('/exercise-media/', BASE, 'tok')).toBeNull();
    expect(resolveExerciseMediaSource('javascript:alert(1)', BASE, 'tok')).toBeNull();
    expect(resolveExerciseMediaSource('', BASE, 'tok')).toBeNull();
    expect(resolveExerciseMediaSource(null, BASE, 'tok')).toBeNull();
  });
});
