import type { MetricSampleInput } from '../types/api';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QueuedMetricBatch {
  localId: string;
  connectionId: string;
  samples: MetricSampleInput[];
  queuedAt: string;
  attempts: number;
}

export interface FlushResult {
  succeeded: string[];
  failed: string[];
}

const STORAGE_KEY = '@bocado/client/device-metric-queue';

/**
 * Mesmo padrão de ExecutionLogQueue/ScaleReadingQueue: um lote de amostras
 * é salvo localmente antes mesmo de tentar a rede — nunca perdido por falta
 * de conexão. A deduplicação em si (dedupHash) é feita pelo backend, não
 * aqui; a fila só garante que o lote chegue, mesmo que atrasado.
 */
export class DeviceMetricQueue {
  constructor(
    private readonly store: KeyValueStore,
    private readonly generateId: () => string = defaultIdFactory,
  ) {}

  async list(): Promise<QueuedMetricBatch[]> {
    const raw = await this.store.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async size(): Promise<number> {
    return (await this.list()).length;
  }

  private async save(items: QueuedMetricBatch[]): Promise<void> {
    await this.store.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  async enqueue(connectionId: string, samples: MetricSampleInput[]): Promise<QueuedMetricBatch> {
    const items = await this.list();
    const entry: QueuedMetricBatch = {
      localId: this.generateId(),
      connectionId,
      samples,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };
    await this.save([...items, entry]);
    return entry;
  }

  async remove(localId: string): Promise<void> {
    const items = await this.list();
    await this.save(items.filter((item) => item.localId !== localId));
  }

  async flush(
    send: (connectionId: string, samples: MetricSampleInput[]) => Promise<unknown>,
  ): Promise<FlushResult> {
    const items = await this.list();
    const succeeded: string[] = [];
    const remaining: QueuedMetricBatch[] = [];

    for (const item of items) {
      try {
        await send(item.connectionId, item.samples);
        succeeded.push(item.localId);
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }

    await this.save(remaining);
    return { succeeded, failed: remaining.map((item) => item.localId) };
  }
}

function defaultIdFactory(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
