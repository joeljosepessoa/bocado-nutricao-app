import type { BleAdvertisement, BleServiceDescriptor, RawDevicePayload } from './types';
import { bytesToBase64 } from './base64';
import { HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID, HEART_RATE_SERVICE_UUID } from './heartRateServiceDriver';

/**
 * Simulação de uma cinta de FC real — usada só pelo MockBleTransport (app e
 * testes), nunca por um driver de produção. Gera bytes no formato oficial
 * do characteristic 0x2A37 (flags + HR de 8 bits, contato detectado).
 */
export const MOCK_HR_ADVERTISEMENT: BleAdvertisement = {
  deviceIdentifier: 'MOCK-HR-STRAP-0001',
  localName: 'Cinta FC (simulação)',
  serviceUuids: [HEART_RATE_SERVICE_UUID],
};

export const MOCK_HR_SERVICE_DESCRIPTOR: BleServiceDescriptor = {
  serviceUuid: HEART_RATE_SERVICE_UUID,
  characteristicUuids: [HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID],
};

function encodeHeartRateMeasurement(bpm: number, contactDetected = true): string {
  // flags: formato 8-bit (bit0=0), contato suportado+detectado (bits1-2=11) quando contactDetected
  const flags = contactDetected ? 0b00000110 : 0b00000010;
  const clamped = Math.max(0, Math.min(255, Math.round(bpm)));
  return bytesToBase64([flags, clamped]);
}

export function simulateHeartRatePayload(bpmOverride?: number): RawDevicePayload {
  const bpm = bpmOverride ?? Math.round(58 + Math.random() * 40);
  return {
    deviceIdentifier: MOCK_HR_ADVERTISEMENT.deviceIdentifier,
    serviceUuid: MOCK_HR_SERVICE_DESCRIPTOR.serviceUuid,
    characteristicUuid: MOCK_HR_SERVICE_DESCRIPTOR.characteristicUuids[0],
    bytesBase64: encodeHeartRateMeasurement(bpm),
    capturedAt: new Date().toISOString(),
  };
}
