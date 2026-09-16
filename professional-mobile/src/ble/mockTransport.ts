import type {
  BleAdvertisement,
  BleDeviceHandle,
  BleServiceDescriptor,
  BleTransport,
  RawScalePayload,
  Unsubscribe,
} from './types';

export interface MockBleTransportOptions {
  advertisement: BleAdvertisement;
  serviceDescriptor: BleServiceDescriptor;
  /** Gera um novo payload a cada leitura — permite variar o valor simulado entre execuções. */
  generatePayload: () => RawScalePayload;
  discoveryDelayMs?: number;
  readingDelayMs?: number;
}

/**
 * Transporte simulado — não fala com hardware nenhum. Prova o pipeline
 * inteiro (scan → connect → discoverServices → leitura) ponta a ponta sem
 * depender de uma biblioteca BLE real. A biblioteca de transporte real só
 * entra quando o modelo real da balança for conhecido (§09 do desenho).
 */
export class MockBleTransport implements BleTransport {
  private readonly connected = new Set<string>();

  constructor(private readonly options: MockBleTransportOptions) {}

  startScan(onDiscovered: (advertisement: BleAdvertisement) => void): Unsubscribe {
    const timer = setTimeout(() => onDiscovered(this.options.advertisement), this.options.discoveryDelayMs ?? 400);
    return () => clearTimeout(timer);
  }

  stopScan(): void {
    // nada além do timer do próprio startScan, já cancelável pelo Unsubscribe retornado.
  }

  async connect(deviceIdentifier: string): Promise<BleDeviceHandle> {
    this.connected.add(deviceIdentifier);
    return { deviceIdentifier };
  }

  async disconnect(deviceIdentifier: string): Promise<void> {
    this.connected.delete(deviceIdentifier);
  }

  async discoverServices(_deviceIdentifier: string): Promise<BleServiceDescriptor[]> {
    return [this.options.serviceDescriptor];
  }

  subscribeToReadings(deviceIdentifier: string, onPayload: (raw: RawScalePayload) => void): Unsubscribe {
    const timer = setTimeout(() => {
      if (this.connected.has(deviceIdentifier)) {
        onPayload(this.options.generatePayload());
      }
    }, this.options.readingDelayMs ?? 1200);
    return () => clearTimeout(timer);
  }
}
