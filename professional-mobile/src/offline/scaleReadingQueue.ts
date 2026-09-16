import type { ConfirmScaleReadingInput, ScaleReadingSummary } from '../types/api';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QueuedScaleReading {
  localId: string;
  clientId: string;
  evaluationId: string;
  payload: ConfirmScaleReadingInput;
  queuedAt: string;
  attempts: number;
}

export interface FlushResult {
  succeeded: string[];
  failed: string[];
}

const STORAGE_KEY = '@bocado/professional/scale-reading-queue';

/**
 * Mesmo padrão de ExecutionLogQueue (app do cliente, Fase 6/7): uma leitura
 * confirmada é gravada localmente antes mesmo de tentar a rede — nunca
 * perdida por falta de conexão — e só sai da fila depois de confirmação do
 * backend. `payload.idempotencyKey` (gerada na leitura, não no envio) é o
 * que torna um reenvio seguro (Fase 10, §11 do desenho).
 */
export class ScaleReadingQueue {
  constructor(
    private readonly store: KeyValueStore,
    private readonly generateId: () => string = defaultIdFactory,
  ) {}

  async list(): Promise<QueuedScaleReading[]> {
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

  private async save(items: QueuedScaleReading[]): Promise<void> {
    await this.store.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  async enqueue(clientId: string, evaluationId: string, payload: ConfirmScaleReadingInput): Promise<QueuedScaleReading> {
    const items = await this.list();
    const alreadyQueued = items.find((item) => item.payload.idempotencyKey === payload.idempotencyKey);
    if (alreadyQueued) {
      return alreadyQueued;
    }
    const entry: QueuedScaleReading = {
      localId: this.generateId(),
      clientId,
      evaluationId,
      payload,
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

  /**
   * Reenvia cada item pendente, na ordem em que foi enfileirado. Uma falha
   * isolada não interrompe o envio dos demais; itens que falham permanecem
   * na fila com `attempts` incrementado para a próxima tentativa.
   */
  async flush(
    send: (clientId: string, evaluationId: string, payload: ConfirmScaleReadingInput) => Promise<ScaleReadingSummary>,
  ): Promise<FlushResult> {
    const items = await this.list();
    const succeeded: string[] = [];
    const remaining: QueuedScaleReading[] = [];

    for (const item of items) {
      try {
        await send(item.clientId, item.evaluationId, item.payload);
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
