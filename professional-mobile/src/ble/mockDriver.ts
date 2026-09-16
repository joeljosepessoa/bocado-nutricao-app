import type {
  BleAdvertisement,
  BleDeviceHandle,
  BleServiceDescriptor,
  BleTransport,
  NormalizedScaleReading,
  RawScalePayload,
  ScaleDriver,
  Unsubscribe,
  ValidationResult,
} from './types';
import { base64ToUtf8, utf8ToBase64 } from './base64';

const MOCK_SERVICE_UUID = '0000fee0-0000-1000-8000-00805f9b34fb';
const MOCK_CHARACTERISTIC_UUID = '0000fee1-0000-1000-8000-00805f9b34fb';

/**
 * Único driver desta fase — não representa nenhum fabricante real. Existe
 * para provar o pipeline (matches → connect → decode → validate) ponta a
 * ponta em teste e em demonstração no app, sem inventar um protocolo real
 * (§07/§08 do desenho: um driver de fabricante real é uma sub-fase própria).
 *
 * O "payload bruto" aqui é só JSON codificado em base64 — não bytes de um
 * protocolo BLE real — porque nenhum payload real foi fornecido.
 */
export function createMockScaleDriver(): ScaleDriver {
  // Estado do próprio driver (a que dispositivo está conectado) — cada
  // fábrica (createMockScaleDriver()) tem a sua instância, então não há
  // conflito entre uma tela que crie mais de uma por engano.
  let connectedDeviceId: string | null = null;

  return {
    id: 'mock-scale-v1',
    manufacturer: 'Bocado (simulação)',
    model: 'Balança de teste',
    protocolVersion: '1.0',
    capabilities: ['weightKg', 'bodyFatPercent', 'muscleMassKg', 'bodyWaterPercent'],

    matches(advertisement: BleAdvertisement): boolean {
      return advertisement.serviceUuids.includes(MOCK_SERVICE_UUID);
    },

    async connect(transport: BleTransport, device: BleDeviceHandle): Promise<void> {
      await transport.connect(device.deviceIdentifier);
      connectedDeviceId = device.deviceIdentifier;
    },

    async disconnect(transport: BleTransport): Promise<void> {
      if (connectedDeviceId) {
        await transport.disconnect(connectedDeviceId);
        connectedDeviceId = null;
      }
    },

    async discoverServices(transport: BleTransport): Promise<BleServiceDescriptor[]> {
      if (!connectedDeviceId) {
        throw new Error('Driver não conectado a nenhum dispositivo.');
      }
      return transport.discoverServices(connectedDeviceId);
    },

    onReading(transport: BleTransport, cb: (raw: RawScalePayload) => void): Unsubscribe {
      if (!connectedDeviceId) {
        throw new Error('Driver não conectado a nenhum dispositivo.');
      }
      return transport.subscribeToReadings(connectedDeviceId, cb);
    },

    decode(raw: RawScalePayload): NormalizedScaleReading {
      try {
        return JSON.parse(base64ToUtf8(raw.bytesBase64)) as NormalizedScaleReading;
      } catch {
        return {};
      }
    },

    validate(reading: NormalizedScaleReading): ValidationResult {
      if (reading.weightKg == null) {
        return { ok: false, reason: 'Peso não foi recebido da balança.' };
      }
      if (reading.weightKg <= 0 || reading.weightKg > 400) {
        return { ok: false, reason: 'Peso fora de uma faixa plausível.' };
      }
      if (reading.bodyFatPercent != null && (reading.bodyFatPercent < 0 || reading.bodyFatPercent > 100)) {
        return { ok: false, reason: '%gordura fora de uma faixa plausível.' };
      }
      return { ok: true };
    },
  };
}

export function encodeMockPayload(reading: NormalizedScaleReading): string {
  return utf8ToBase64(JSON.stringify(reading));
}

export const MOCK_ADVERTISEMENT: BleAdvertisement = {
  deviceIdentifier: 'MOCK-SCALE-0001',
  localName: 'Balança (simulação)',
  serviceUuids: [MOCK_SERVICE_UUID],
};

export const MOCK_SERVICE_DESCRIPTOR: BleServiceDescriptor = {
  serviceUuid: MOCK_SERVICE_UUID,
  characteristicUuids: [MOCK_CHARACTERISTIC_UUID],
};
