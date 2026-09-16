import type { NormalizedScaleReading as NormalizedScaleReadingFields } from '../types/api';

/**
 * Tipos do pipeline BLE (Fase 10, §02-§04 do desenho). Nenhum tipo aqui
 * assume fabricante, UUID ou payload real — só o contrato que qualquer
 * driver futuro precisa cumprir.
 */

export type ScaleCapability = keyof NormalizedScaleReading;

export interface ScaleDriverDescriptor {
  /** Identidade estável — vira ScaleReading.driverId no backend. */
  id: string;
  manufacturer: string;
  model: string;
  protocolVersion: string;
  capabilities: ScaleCapability[];
}

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

export interface RawScalePayload {
  deviceIdentifier: string;
  serviceUuid: string;
  characteristicUuid: string;
  /** Bytes exatamente como recebidos da característica BLE, sem transformação. */
  bytesBase64: string;
  capturedAt: string;
}

/** Mesmo shape que o backend persiste (types/api.ts) — reexportado aqui por conveniência do domínio BLE. */
export type NormalizedScaleReading = NormalizedScaleReadingFields;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export type Unsubscribe = () => void;

/**
 * Camada de transporte — fala em bytes, não conhece driver nenhum. A
 * implementação real (biblioteca BLE nativa) fica fora do escopo desta
 * fase (ver §09 do desenho: depende do modelo real da balança); o app usa
 * MockBleTransport até lá.
 */
export interface BleTransport {
  startScan(onDiscovered: (advertisement: BleAdvertisement) => void): Unsubscribe;
  stopScan(): void;
  connect(deviceIdentifier: string): Promise<BleDeviceHandle>;
  disconnect(deviceIdentifier: string): Promise<void>;
  discoverServices(deviceIdentifier: string): Promise<BleServiceDescriptor[]>;
  subscribeToReadings(deviceIdentifier: string, onPayload: (raw: RawScalePayload) => void): Unsubscribe;
}

export interface ScaleDriver extends ScaleDriverDescriptor {
  matches(advertisement: BleAdvertisement): boolean;
  connect(transport: BleTransport, device: BleDeviceHandle): Promise<void>;
  disconnect(transport: BleTransport): Promise<void>;
  discoverServices(transport: BleTransport): Promise<BleServiceDescriptor[]>;
  onReading(transport: BleTransport, cb: (raw: RawScalePayload) => void): Unsubscribe;
  decode(raw: RawScalePayload): NormalizedScaleReading;
  validate(reading: NormalizedScaleReading): ValidationResult;
}
