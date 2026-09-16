/**
 * Base64 sem depender de Buffer (Node) nem atob/btoa (DOM) — nenhum dos
 * dois é garantido no runtime do Hermes/React Native sem polyfill extra.
 * Cópia independente da mesma utilidade criada na Fase 10
 * (professional-mobile/src/ble/base64.ts) — não importada de lá.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: number[]): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    output += CHARS[b0 >> 2];
    output += CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    output += b1 === undefined ? '=' : CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    output += b2 === undefined ? '=' : CHARS[b2 & 0x3f];
  }
  return output;
}

export function base64ToBytes(input: string): number[] {
  const clean = input.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}
