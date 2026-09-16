/**
 * Pipeline BLE de wearable (Fase 11) — cópia independente do padrão criado
 * na Fase 10 (professional-mobile/src/ble), NÃO importada nem acoplada ao
 * ScaleDriverRegistry: são apps diferentes, domínios diferentes (balança do
 * profissional vs. wearable do cliente), decisão explícita do desenho.
 */

/** Mesmo catálogo fechado do backend (Prisma DeviceMetricType) — nenhuma métrica extra inventada aqui. */
export type DeviceMetricType =
  | 'heart_rate'
  | 'resting_heart_rate'
  | 'steps'
  | 'distance'
  | 'active_calories'
  | 'sleep_session'
  | 'workout_activity'
  | 'exercise_duration'
  | 'oxygen_saturation'
  | 'body_temperature'
  | 'respiratory_rate';

export interface BleAdvertisement {
  deviceIdentifier: string;
  localName?: string;
  serviceUuids: string[];
  rssi?: number;
}

export interface BleServiceDescriptor {
  serviceUuid: string;
  characteristicUuids: string[];
}

export interface BleDeviceHandle {
  deviceIdentifier: string;
}

export interface RawDevicePayload {
  deviceIdentifier: string;
  serviceUuid: string;
  characteristicUuid: string;
  bytesBase64: string;
  capturedAt: string;
}

/** Uma leitura BLE decodificada vira exatamente uma amostra — instantânea (startedAt == endedAt). */
export interface NormalizedDeviceSample {
  metricType: DeviceMetricType;
  value: number;
  unit: string;
  startedAt: string;
  endedAt: string;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export type Unsubscribe = () => void;

export interface BleTransport {
  startScan(onDiscovered: (advertisement: BleAdvertisement) => void): Unsubscribe;
  stopScan(): void;
  connect(deviceIdentifier: string): Promise<BleDeviceHandle>;
  disconnect(deviceIdentifier: string): Promise<void>;
  discoverServices(deviceIdentifier: string): Promise<BleServiceDescriptor[]>;
  subscribeToReadings(deviceIdentifier: string, onPayload: (raw: RawDevicePayload) => void): Unsubscribe;
}

export interface WearableDriverDescriptor {
  id: string;
  manufacturer: string;
  model: string;
  protocolVersion: string;
  capabilities: DeviceMetricType[];
}

export interface WearableDriver extends WearableDriverDescriptor {
  matches(advertisement: BleAdvertisement): boolean;
  connect(transport: BleTransport, device: BleDeviceHandle): Promise<void>;
  disconnect(transport: BleTransport): Promise<void>;
  discoverServices(transport: BleTransport): Promise<BleServiceDescriptor[]>;
  onReading(transport: BleTransport, cb: (raw: RawDevicePayload) => void): Unsubscribe;
  /** null quando o pacote não produz uma amostra utilizável (ex.: malformado). */
  decode(raw: RawDevicePayload): NormalizedDeviceSample | null;
  validate(sample: NormalizedDeviceSample): ValidationResult;
}
