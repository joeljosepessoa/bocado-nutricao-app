import type {
  BleAdvertisement,
  BleDeviceHandle,
  BleServiceDescriptor,
  BleTransport,
  RawDevicePayload,
  Unsubscribe,
} from './types';

export interface MockBleTransportOptions {
  advertisement: BleAdvertisement;
  serviceDescriptor: BleServiceDescriptor;
  generatePayload: () => RawDevicePayload;
  discoveryDelayMs?: number;
  readingDelayMs?: number;
  /** Repete a leitura a cada N ms depois da primeira, simulando notificações contínuas de FC. */
  repeatEveryMs?: number;
}

/**
 * Mesma ideia do MockBleTransport da Fase 10 — cópia independente, não
 * compartilhada com professional-mobile. Não fala com hardware nenhum;
 * prova o pipeline (scan → conectar → notificações contínuas) sem
 * depender de um dispositivo real.
 */
export class MockBleTransport implements BleTransport {
  private readonly connected = new Set<string>();
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

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
    if (this.repeatTimer) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  async discoverServices(_deviceIdentifier: string): Promise<BleServiceDescriptor[]> {
    return [this.options.serviceDescriptor];
  }

  subscribeToReadings(deviceIdentifier: string, onPayload: (raw: RawDevicePayload) => void): Unsubscribe {
    const emit = () => {
      if (this.connected.has(deviceIdentifier)) {
        onPayload(this.options.generatePayload());
      }
    };
    const timer = setTimeout(emit, this.options.readingDelayMs ?? 1200);

    let interval: ReturnType<typeof setInterval> | null = null;
    if (this.options.repeatEveryMs) {
      interval = setInterval(emit, this.options.repeatEveryMs);
      this.repeatTimer = interval;
    }

    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }
}
