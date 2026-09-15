import type { CreateExecutionLogInput } from '../types/api';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QueuedExecutionLog {
  localId: string;
  payload: CreateExecutionLogInput;
  queuedAt: string;
  attempts: number;
}

export interface FlushResult {
  succeeded: string[];
  failed: string[];
}

const STORAGE_KEY = '@bocado/client/execution-queue';

/**
 * Fila de registros de execução de treino pendentes de envio. O cliente
 * pode registrar a execução do treino sem conexão (ex.: academia sem
 * sinal); o registro fica salvo localmente e é reenviado quando a rede
 * volta. Nunca perde um registro por causa de falha de rede — só remove
 * da fila depois de confirmação do backend.
 */
export class ExecutionLogQueue {
  constructor(
    private readonly store: KeyValueStore,
    private readonly generateId: () => string = defaultIdFactory,
  ) {}

  async list(): Promise<QueuedExecutionLog[]> {
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

  private async save(items: QueuedExecutionLog[]): Promise<void> {
    await this.store.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  async enqueue(payload: CreateExecutionLogInput): Promise<QueuedExecutionLog> {
    const items = await this.list();
    const entry: QueuedExecutionLog = {
      localId: this.generateId(),
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
   * Tenta reenviar cada item pendente, na ordem em que foi enfileirado.
   * Uma falha isolada não interrompe o envio dos demais; itens que falham
   * permanecem na fila com `attempts` incrementado para uma próxima
   * tentativa.
   */
  async flush(send: (payload: CreateExecutionLogInput) => Promise<void>): Promise<FlushResult> {
    const items = await this.list();
    const succeeded: string[] = [];
    const remaining: QueuedExecutionLog[] = [];

    for (const item of items) {
      try {
        await send(item.payload);
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
