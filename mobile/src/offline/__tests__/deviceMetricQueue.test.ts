import { DeviceMetricQueue, type KeyValueStore } from '../deviceMetricQueue';
import type { MetricSampleInput } from '../../types/api';

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

function sample(overrides: Partial<MetricSampleInput> = {}): MetricSampleInput {
  const now = new Date().toISOString();
  return { metricType: 'heart_rate', value: 70, unit: 'bpm', startedAt: now, endedAt: now, ...overrides };
}

describe('DeviceMetricQueue', () => {
  it('começa vazia', async () => {
    const queue = new DeviceMetricQueue(createMemoryStore());
    expect(await queue.list()).toEqual([]);
    expect(await queue.size()).toBe(0);
  });

  it('enfileira um lote de amostras offline e persiste no store', async () => {
    const store = createMemoryStore();
    const queue = new DeviceMetricQueue(store, () => 'local-1');
    const entry = await queue.enqueue('conn-1', [sample()]);

    expect(entry.localId).toBe('local-1');
    expect(entry.attempts).toBe(0);
    expect(await queue.size()).toBe(1);

    const queue2 = new DeviceMetricQueue(store);
    expect(await queue2.size()).toBe(1);
  });

  it('flush envia tudo com sucesso e esvazia a fila', async () => {
    const queue = new DeviceMetricQueue(createMemoryStore());
    await queue.enqueue('conn-1', [sample()]);
    await queue.enqueue('conn-2', [sample({ metricType: 'steps', value: 500, unit: 'steps' })]);

    const sent: string[] = [];
    const result = await queue.flush(async (connectionId) => {
      sent.push(connectionId);
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(sent).toEqual(['conn-1', 'conn-2']);
    expect(await queue.size()).toBe(0);
  });

  it('mantém na fila os lotes cujo envio falha, sem descartar os demais', async () => {
    const queue = new DeviceMetricQueue(createMemoryStore());
    await queue.enqueue('ok-1', [sample()]);
    await queue.enqueue('falha', [sample()]);
    await queue.enqueue('ok-2', [sample()]);

    const result = await queue.flush(async (connectionId) => {
      if (connectionId === 'falha') {
        throw new Error('offline');
      }
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);

    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].connectionId).toBe('falha');
    expect(remaining[0].attempts).toBe(1);
  });

  it('remove um lote específico da fila', async () => {
    const queue = new DeviceMetricQueue(createMemoryStore(), () => 'x');
    const entry = await queue.enqueue('conn-1', [sample()]);
    await queue.remove(entry.localId);
    expect(await queue.size()).toBe(0);
  });

  it('tolera conteúdo corrompido no store e trata como fila vazia', async () => {
    const store = createMemoryStore();
    await store.setItem('@bocado/client/device-metric-queue', '{not-json');
    const queue = new DeviceMetricQueue(store);
    expect(await queue.list()).toEqual([]);
  });
});
