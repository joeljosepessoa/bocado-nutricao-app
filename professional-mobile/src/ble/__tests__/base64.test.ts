import { base64ToUtf8, utf8ToBase64 } from '../base64';

describe('base64 (sem Buffer/atob — Hermes-safe)', () => {
  it('faz round-trip de texto simples', () => {
    const text = 'peso:82.4';
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it('faz round-trip de JSON com acentuação (payload simulado real)', () => {
    const text = JSON.stringify({ weightKg: 82.4, bodyFatPercent: 18.2, nota: 'balança calibrada' });
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it('faz round-trip de string vazia', () => {
    expect(base64ToUtf8(utf8ToBase64(''))).toBe('');
  });

  it('produz base64 sem caracteres inválidos', () => {
    const encoded = utf8ToBase64('qualquer coisa 123 !@#');
    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  });
});
