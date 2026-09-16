/**
 * Base64 sem depender de Buffer (Node) nem atob/btoa (DOM) — nenhum dos
 * dois é garantido no runtime do Hermes/React Native sem polyfill extra.
 * Usado só pelo MockScaleDriver para codificar/decodificar o "payload"
 * simulado; um transporte BLE real devolve bytes já em base64 (RawScalePayload
 * já assume isso), então esta função não entra no caminho de um driver real.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8ToBase64(input: string): string {
  const bytes = utf8Encode(input);
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

export function base64ToUtf8(input: string): string {
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
  return utf8Decode(bytes);
}

function utf8Encode(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.codePointAt(i)!;
    if (code > 0xffff) i++; // par substituto consumido
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      result += String.fromCharCode(b0);
      i += 1;
    } else if (b0 >> 5 === 0x06) {
      const codePoint = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      result += String.fromCharCode(codePoint);
      i += 2;
    } else if (b0 >> 4 === 0x0e) {
      const codePoint = ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      result += String.fromCharCode(codePoint);
      i += 3;
    } else {
      const codePoint =
        ((b0 & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      result += String.fromCodePoint(codePoint);
      i += 4;
    }
  }
  return result;
}
