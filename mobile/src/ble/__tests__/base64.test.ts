import { base64ToBytes, bytesToBase64 } from '../base64';

describe('base64 (BLE, mobile — Hermes-safe)', () => {
  it('faz round-trip de bytes arbitrários', () => {
    const bytes = [0, 1, 2, 254, 255, 128, 6, 72];
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('faz round-trip de um único byte', () => {
    expect(base64ToBytes(bytesToBase64([72]))).toEqual([72]);
  });

  it('faz round-trip de array vazio', () => {
    expect(base64ToBytes(bytesToBase64([]))).toEqual([]);
  });
});
