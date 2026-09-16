import type {
  BleAdvertisement,
  BleDeviceHandle,
  BleServiceDescriptor,
  BleTransport,
  NormalizedDeviceSample,
  RawDevicePayload,
  Unsubscribe,
  ValidationResult,
  WearableDriver,
} from './types';
import { base64ToBytes } from './base64';

/**
 * Heart Rate Service (0x180D) / Heart Rate Measurement (0x2A37) — perfil
 * GATT padronizado pelo Bluetooth SIG, publicamente documentado, implementado
 * por praticamente toda cinta de frequência cardíaca do mercado. Diferente
 * da Relaxmedic (Fase 10): aqui o protocolo é real e público, não inventado.
 *
 * Único caso de BLE direto aprovado no desenho da Fase 11 — smartwatches e
 * pulseiras de atividade completas ficam para HealthKit/Health Connect.
 */
export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

interface DecodedHeartRateMeasurement {
  bpm: number;
  sensorContactSupported: boolean;
  sensorContactDetected: boolean;
}

/** Parser do formato oficial do characteristic 0x2A37 (GATT Heart Rate Service spec). */
export function decodeHeartRateMeasurementBytes(bytes: number[]): DecodedHeartRateMeasurement | null {
  if (bytes.length < 2) {
    return null;
  }
  const flags = bytes[0];
  const hrFormat16Bit = (flags & 0x01) !== 0;
  const contactBits = (flags >> 1) & 0x03;
  const sensorContactSupported = contactBits === 0b10 || contactBits === 0b11;
  const sensorContactDetected = contactBits === 0b11;

  let bpm: number;
  if (hrFormat16Bit) {
    if (bytes.length < 3) return null;
    bpm = bytes[1] | (bytes[2] << 8);
  } else {
    bpm = bytes[1];
  }
  // Energy Expended e RR-Interval (se presentes nos bytes seguintes) não são
  // extraídos: nenhum DeviceMetricType do catálogo os representa — não
  // inventamos um tipo novo só porque o pacote carrega o dado.

  return { bpm, sensorContactSupported, sensorContactDetected };
}

export function createHeartRateServiceDriver(): WearableDriver {
  let connectedDeviceId: string | null = null;

  return {
    id: 'heart-rate-service-v1',
    manufacturer: 'Padrão (Bluetooth SIG)',
    model: 'Heart Rate Service (0x180D)',
    protocolVersion: '1.0',
    capabilities: ['heart_rate'],

    matches(advertisement: BleAdvertisement): boolean {
      return advertisement.serviceUuids.includes(HEART_RATE_SERVICE_UUID);
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

    onReading(transport: BleTransport, cb: (raw: RawDevicePayload) => void): Unsubscribe {
      if (!connectedDeviceId) {
        throw new Error('Driver não conectado a nenhum dispositivo.');
      }
      return transport.subscribeToReadings(connectedDeviceId, cb);
    },

    decode(raw: RawDevicePayload): NormalizedDeviceSample | null {
      const bytes = base64ToBytes(raw.bytesBase64);
      const parsed = decodeHeartRateMeasurementBytes(bytes);
      if (!parsed) {
        return null;
      }
      // Sensor com contato suportado mas não detectado: o próprio
      // dispositivo está dizendo que a leitura não é confiável (cinta
      // frouxa/fora do corpo) — não fabricamos uma amostra a partir disso.
      if (parsed.sensorContactSupported && !parsed.sensorContactDetected) {
        return null;
      }
      return {
        metricType: 'heart_rate',
        value: parsed.bpm,
        unit: 'bpm',
        startedAt: raw.capturedAt,
        endedAt: raw.capturedAt,
      };
    },

    validate(sample: NormalizedDeviceSample): ValidationResult {
      if (sample.metricType !== 'heart_rate') {
        return { ok: false, reason: 'Métrica inesperada para este driver.' };
      }
      if (sample.value < 20 || sample.value > 250) {
        return { ok: false, reason: 'Frequência cardíaca fora de uma faixa plausível.' };
      }
      return { ok: true };
    },
  };
}
