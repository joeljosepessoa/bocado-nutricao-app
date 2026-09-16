import { ScaleReadingQueue, type FlushResult } from './scaleReadingQueue';
import { asyncStorageStore } from './storage';
import * as api from '../api/endpoints';
import type { ConfirmScaleReadingInput } from '../types/api';

export const scaleReadingQueue = new ScaleReadingQueue(asyncStorageStore);

export async function enqueueScaleReadingOffline(
  clientId: string,
  evaluationId: string,
  payload: ConfirmScaleReadingInput,
) {
  return scaleReadingQueue.enqueue(clientId, evaluationId, payload);
}

/** Reenvia o que estiver pendente; seguro para chamar repetidamente (ex.: a cada foco de tela). */
export async function flushScaleReadingQueue(): Promise<FlushResult> {
  return scaleReadingQueue.flush((clientId, evaluationId, payload) =>
    api.confirmScaleReading(clientId, evaluationId, payload),
  );
}
