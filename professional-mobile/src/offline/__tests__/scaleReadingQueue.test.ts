import { ScaleReadingQueue, type KeyValueStore } from '../scaleReadingQueue';
import type { ConfirmScaleReadingInput, ScaleReadingSummary } from '../../types/api';

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

function samplePayload(overrides: Partial<ConfirmScaleReadingInput> = {}): ConfirmScaleReadingInput {
  return {
    status: 'confirmed',
    driverId: 'mock-scale-v1',
    deviceIdentifier: 'MOCK-SCALE-0001',
    protocolVersion: '1.0',
    recordedAt: new Date().toISOString(),
    idempotencyKey: `key-${Math.random()}`,
    rawPayload: { bytesBase64: 'AA==' },
    normalized: { weightKg: 80 },
    ...overrides,
  };
}

function summaryFor(payload: ConfirmScaleReadingInput): ScaleReadingSummary {
  return {
    id: `reading-${payload.idempotencyKey}`,
    evaluationId: 'evaluation-1',
    status: payload.status,
    driverId: payload.driverId,
    deviceIdentifier: payload.deviceIdentifier,
    protocolVersion: payload.protocolVersion,
    normalized: payload.normalized ?? {},
    recordedAt: payload.recordedAt,
    createdAt: new Date().toISOString(),
  };
}

describe('ScaleReadingQueue', () => {
  it('começa vazia', async () => {
    const queue = new ScaleReadingQueue(createMemoryStore());
    expect(await queue.list()).toEqual([]);
    expect(await queue.size()).toBe(0);
  });

  it('enfileira uma confirmação feita offline e persiste no store', async () => {
    const store = createMemoryStore();
    const queue = new ScaleReadingQueue(store, () => 'local-1');
    const entry = await queue.enqueue('client-1', 'evaluation-1', samplePayload());

    expect(entry.localId).toBe('local-1');
    expect(entry.attempts).toBe(0);
    expect(await queue.size()).toBe(1);

    const queue2 = new ScaleReadingQueue(store);
    expect(await queue2.size()).toBe(1);
  });

  it('não duplica ao enfileirar a mesma idempotencyKey duas vezes (ex.: duplo toque em "Confirmar")', async () => {
    const queue = new ScaleReadingQueue(createMemoryStore());
    const payload = samplePayload();
    await queue.enqueue('client-1', 'evaluation-1', payload);
    await queue.enqueue('client-1', 'evaluation-1', payload);

    expect(await queue.size()).toBe(1);
  });

  it('flush envia tudo com sucesso e esvazia a fila', async () => {
    const queue = new ScaleReadingQueue(createMemoryStore());
    await queue.enqueue('client-1', 'evaluation-1', samplePayload());
    await queue.enqueue('client-1', 'evaluation-1', samplePayload());

    const sent: string[] = [];
    const result = await queue.flush(async (clientId, evaluationId, payload) => {
      sent.push(payload.idempotencyKey);
      return summaryFor(payload);
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(sent).toHaveLength(2);
    expect(await queue.size()).toBe(0);
  });

  it('mantém na fila os itens cujo envio falha, sem descartar os demais', async () => {
    const queue = new ScaleReadingQueue(createMemoryStore());
    await queue.enqueue('client-1', 'evaluation-1', samplePayload({ idempotencyKey: 'ok' }));
    await queue.enqueue('client-1', 'evaluation-1', samplePayload({ idempotencyKey: 'falha' }));
    await queue.enqueue('client-1', 'evaluation-1', samplePayload({ idempotencyKey: 'ok-2' }));

    const result = await queue.flush(async (clientId, evaluationId, payload) => {
      if (payload.idempotencyKey === 'falha') {
        throw new Error('offline');
      }
      return summaryFor(payload);
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);

    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.idempotencyKey).toBe('falha');
    expect(remaining[0].attempts).toBe(1);
  });

  it('remove um item específico da fila', async () => {
    const queue = new ScaleReadingQueue(createMemoryStore(), () => 'x');
    const entry = await queue.enqueue('client-1', 'evaluation-1', samplePayload());
    await queue.remove(entry.localId);
    expect(await queue.size()).toBe(0);
  });

  it('tolera conteúdo corrompido no store e trata como fila vazia', async () => {
    const store = createMemoryStore();
    await store.setItem('@bocado/professional/scale-reading-queue', '{not-json');
    const queue = new ScaleReadingQueue(store);
    expect(await queue.list()).toEqual([]);
  });
});
