import {
  ICOMON_LIVE,
  ICOMON_RESULT,
  ICOMON_SERVICE,
  ICOMON_WRITE,
  ackFrame,
  parseFrame,
  profileFrame,
  readyFrame,
  toHex,
  type LiveWeight,
  type ScaleProfile,
  type ScaleResult,
} from './icomonProtocol';

/* Tipos mínimos da Web Bluetooth (Chrome/Edge) — o TypeScript não traz essa API. */
interface BtCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristic(uuid: number | string): Promise<BtCharacteristic>;
}
interface BtServer {
  connected: boolean;
  getPrimaryService(uuid: number | string): Promise<BtService>;
  disconnect(): void;
}
interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: { connect(): Promise<BtServer> };
}
interface BtNavigator {
  bluetooth?: { requestDevice(options: unknown): Promise<BtDevice> };
}

export function bluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as BtNavigator).bluetooth;
}

export interface ScaleEvents {
  onConnected(deviceName: string): void;
  onLive(reading: LiveWeight): void;
  onResult(result: ScaleResult, rawHex: string): void;
  onDisconnected(): void;
  onError(message: string): void;
}

/**
 * Uma pesagem: escolhe a balança, libera a medição com o perfil do paciente,
 * acompanha o peso e entrega o resultado. Nada sai daqui para o servidor.
 */
export class ScaleSession {
  private server: BtServer | null = null;
  private write: BtCharacteristic | null = null;
  private seq = 0;
  private closed = false;
  deviceName = '';
  deviceId = '';

  private readonly profile: ScaleProfile;
  private readonly events: ScaleEvents;

  constructor(profile: ScaleProfile, events: ScaleEvents) {
    this.profile = profile;
    this.events = events;
  }

  async connect(): Promise<void> {
    const bluetooth = (navigator as BtNavigator).bluetooth;
    if (!bluetooth) {
      this.events.onError('Este navegador não conecta em Bluetooth. Use o Chrome ou o Edge no computador.');
      return;
    }
    let device: BtDevice;
    try {
      device = await bluetooth.requestDevice({ filters: [{ services: [ICOMON_SERVICE] }, { namePrefix: 'Relaxmedic' }], optionalServices: [ICOMON_SERVICE] });
    } catch (error) {
      // Fechar a janela de escolha não é erro.
      if ((error as { name?: string }).name === 'NotFoundError') return this.events.onDisconnected();
      return this.events.onError('Não foi possível procurar a balança. Confira se o Bluetooth do computador está ligado.');
    }
    this.deviceName = device.name ?? 'Balança';
    this.deviceId = device.id;
    device.addEventListener('gattserverdisconnected', () => {
      if (!this.closed) this.events.onDisconnected();
    });
    try {
      this.server = await device.gatt!.connect();
      const service = await this.server.getPrimaryService(ICOMON_SERVICE);
      this.write = await service.getCharacteristic(ICOMON_WRITE);
      const live = await service.getCharacteristic(ICOMON_LIVE);
      const result = await service.getCharacteristic(ICOMON_RESULT);
      result.addEventListener('characteristicvaluechanged', () => void this.handle(result.value));
      live.addEventListener('characteristicvaluechanged', () => void this.handle(live.value));
      await result.startNotifications();
      await live.startNotifications();
      this.events.onConnected(this.deviceName);
    } catch {
      this.events.onError('A balança não respondeu. Suba nela para acordá-la e tente de novo.');
    }
  }

  get isConnected(): boolean {
    return !this.closed && !!this.server?.connected;
  }

  close(): void {
    this.closed = true;
    try {
      if (this.server?.connected) this.server.disconnect();
    } catch {
      /* já desconectada */
    }
  }

  private async send(bytes: Uint8Array): Promise<void> {
    if (!this.write) return;
    const frame = new Uint8Array(bytes);
    frame[0] = this.seq++ & 0xff;
    await this.write.writeValueWithResponse(frame);
  }

  private async handle(value: DataView | undefined): Promise<void> {
    if (!value) return;
    const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    const frame = parseFrame(bytes);
    if (!frame) return;
    try {
      if (frame.kind === 'device-info') {
        await this.send(ackFrame(0, frame.seq));
        await this.send(profileFrame(0, this.profile));
        await this.send(readyFrame(0));
      } else if (frame.kind === 'live') {
        this.events.onLive(frame);
      } else if (frame.kind === 'result') {
        await this.send(ackFrame(0, frame.seq));
        this.events.onResult(frame, toHex(bytes));
      }
    } catch {
      this.events.onError('A conexão com a balança caiu no meio da pesagem. Tente de novo.');
    }
  }
}
