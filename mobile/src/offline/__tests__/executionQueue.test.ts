import { ExecutionLogQueue, type KeyValueStore } from '../executionQueue';
import type { CreateExecutionLogInput } from '../../types/api';

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

function samplePayload(overrides: Partial<CreateExecutionLogInput> = {}): CreateExecutionLogInput {
  return {
    workoutDayId: 'day-1',
    sets: [{ workoutExerciseId: 'we-1', setOrder: 1, repsPerformed: 10 }],
    ...overrides,
  };
}

describe('ExecutionLogQueue', () => {
  it('começa vazia', async () => {
    const queue = new ExecutionLogQueue(createMemoryStore());
    expect(await queue.list()).toEqual([]);
    expect(await queue.size()).toBe(0);
  });

  it('enfileira um registro de execução feito offline e persiste no store', async () => {
    const store = createMemoryStore();
    const queue = new ExecutionLogQueue(store, () => 'local-1');
    const entry = await queue.enqueue(samplePayload());

    expect(entry.localId).toBe('local-1');
    expect(entry.attempts).toBe(0);
    expect(await queue.size()).toBe(1);

    // uma segunda instância lendo o mesmo store enxerga o item persistido
    const queue2 = new ExecutionLogQueue(store);
    expect(await queue2.size()).toBe(1);
  });

  it('preserva a ordem de enfileiramento (FIFO)', async () => {
    let counter = 0;
    const queue = new ExecutionLogQueue(createMemoryStore(), () => `local-${++counter}`);
    await queue.enqueue(samplePayload({ workoutDayId: 'day-1' }));
    await queue.enqueue(samplePayload({ workoutDayId: 'day-2' }));

    const items = await queue.list();
    expect(items.map((i) => i.payload.workoutDayId)).toEqual(['day-1', 'day-2']);
  });

  it('flush envia tudo com sucesso e esvazia a fila', async () => {
    const queue = new ExecutionLogQueue(createMemoryStore());
    await queue.enqueue(samplePayload());
    await queue.enqueue(samplePayload());

    const sent: CreateExecutionLogInput[] = [];
    const result = await queue.flush(async (payload) => {
      sent.push(payload);
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(sent).toHaveLength(2);
    expect(await queue.size()).toBe(0);
  });

  it('mantém na fila os itens cujo envio falha, sem descartar os demais', async () => {
    const queue = new ExecutionLogQueue(createMemoryStore());
    await queue.enqueue(samplePayload({ workoutDayId: 'ok' }));
    await queue.enqueue(samplePayload({ workoutDayId: 'falha' }));
    await queue.enqueue(samplePayload({ workoutDayId: 'ok-2' }));

    const result = await queue.flush(async (payload) => {
      if (payload.workoutDayId === 'falha') {
        throw new Error('offline');
      }
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);

    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.workoutDayId).toBe('falha');
    expect(remaining[0].attempts).toBe(1);
  });

  it('uma falha isolada não interrompe o envio dos itens seguintes na mesma passada', async () => {
    const queue = new ExecutionLogQueue(createMemoryStore());
    await queue.enqueue(samplePayload({ workoutDayId: 'falha-1' }));
    await queue.enqueue(samplePayload({ workoutDayId: 'ok' }));

    const attempted: string[] = [];
    await queue.flush(async (payload) => {
      attempted.push(payload.workoutDayId);
      if (payload.workoutDayId === 'falha-1') {
        throw new Error('offline');
      }
    });

    expect(attempted).toEqual(['falha-1', 'ok']);
  });

  it('remove um item específico da fila', async () => {
    const queue = new ExecutionLogQueue(createMemoryStore(), () => 'x');
    const entry = await queue.enqueue(samplePayload());
    await queue.remove(entry.localId);
    expect(await queue.size()).toBe(0);
  });

  it('tolera conteúdo corrompido no store e trata como fila vazia', async () => {
    const store = createMemoryStore();
    await store.setItem('@bocado/client/execution-queue', '{not-json');
    const queue = new ExecutionLogQueue(store);
    expect(await queue.list()).toEqual([]);
  });
});
