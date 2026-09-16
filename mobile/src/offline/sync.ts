import { ExecutionLogQueue, type FlushResult } from './executionQueue';
import { DeviceMetricQueue, type FlushResult as DeviceFlushResult } from './deviceMetricQueue';
import { asyncStorageStore } from './storage';
import * as api from '../api/endpoints';
import type { CreateExecutionLogInput, MetricSampleInput } from '../types/api';

export const executionLogQueue = new ExecutionLogQueue(asyncStorageStore);

export async function enqueueExecutionLogOffline(payload: CreateExecutionLogInput) {
  return executionLogQueue.enqueue(payload);
}

/** Reenvia o que estiver pendente; seguro para chamar repetidamente (ex.: a cada foco de tela). */
export async function flushExecutionLogQueue(): Promise<FlushResult> {
  return executionLogQueue.flush((payload) => api.logWorkoutExecution(payload));
}

export const deviceMetricQueue = new DeviceMetricQueue(asyncStorageStore);

export async function enqueueDeviceMetricsOffline(connectionId: string, samples: MetricSampleInput[]) {
  return deviceMetricQueue.enqueue(connectionId, samples);
}

/** Reenvia lotes de métricas de dispositivo pendentes; seguro para chamar repetidamente. */
export async function flushDeviceMetricQueue(): Promise<DeviceFlushResult> {
  return deviceMetricQueue.flush((connectionId, samples) => api.ingestDeviceMetrics(connectionId, samples));
}
