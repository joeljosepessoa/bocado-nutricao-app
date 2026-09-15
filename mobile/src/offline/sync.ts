import { ExecutionLogQueue, type FlushResult } from './executionQueue';
import { asyncStorageStore } from './storage';
import * as api from '../api/endpoints';
import type { CreateExecutionLogInput } from '../types/api';

export const executionLogQueue = new ExecutionLogQueue(asyncStorageStore);

export async function enqueueExecutionLogOffline(payload: CreateExecutionLogInput) {
  return executionLogQueue.enqueue(payload);
}

/** Reenvia o que estiver pendente; seguro para chamar repetidamente (ex.: a cada foco de tela). */
export async function flushExecutionLogQueue(): Promise<FlushResult> {
  return executionLogQueue.flush((payload) => api.logWorkoutExecution(payload));
}
