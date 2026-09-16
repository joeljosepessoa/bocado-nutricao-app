import * as Crypto from 'expo-crypto';

/**
 * Gerada a partir da leitura em si (não do envio) — Fase 10, §11 do
 * desenho. Um reenvio de rede ou a fila offline reabrindo o app produzem
 * exatamente a mesma chave, então o backend trata como o mesmo evento.
 */
export async function buildIdempotencyKey(params: {
  deviceIdentifier: string;
  driverId: string;
  bytesBase64: string;
  recordedAt: string;
}): Promise<string> {
  const material = `${params.deviceIdentifier}:${params.driverId}:${params.bytesBase64}:${params.recordedAt}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, material);
}
