import { apiClient } from './client';
import type {
  AiGenerationResult,
  AuthTokenPair,
  ClientSelf,
  CreateExecutionLogInput,
  DeviceConnection,
  DeviceConnectionsResponse,
  DeviceMetricSample,
  DeviceSourceType,
  DietClientSummary,
  EvolutionEntry,
  IngestMetricsResult,
  MetricSampleInput,
  PaginatedResult,
  WorkoutClientSummary,
} from '../types/api';

export async function login(email: string, password: string): Promise<AuthTokenPair> {
  const res = await apiClient.post<AuthTokenPair>('/auth/login', { email, password });
  return res.data;
}

export async function refresh(refreshToken: string): Promise<AuthTokenPair> {
  const res = await apiClient.post<AuthTokenPair>('/auth/refresh', { refreshToken });
  return res.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}

export async function acceptPrivacyTerms(): Promise<void> {
  await apiClient.post('/client/accept-privacy-terms');
}

export async function getMe(): Promise<ClientSelf> {
  const res = await apiClient.get<ClientSelf>('/client/me');
  return res.data;
}

export async function updateMe(dto: { fullName?: string; phone?: string }): Promise<ClientSelf> {
  const res = await apiClient.patch<ClientSelf>('/client/me', dto);
  return res.data;
}

export async function getCurrentDiet(): Promise<DietClientSummary | null> {
  const res = await apiClient.get<{ diet: DietClientSummary | null }>('/client/diet');
  return res.data.diet;
}

export async function getCurrentWorkout(): Promise<WorkoutClientSummary | null> {
  const res = await apiClient.get<{ workout: WorkoutClientSummary | null }>('/client/workout');
  return res.data.workout;
}

export async function logWorkoutExecution(dto: CreateExecutionLogInput): Promise<void> {
  await apiClient.post('/client/workout/execution-logs', dto);
}

export async function listWorkoutExecutions(
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<{ id: string; performedAt: string; workoutDayId: string }>> {
  const res = await apiClient.get('/client/workout/execution-logs', { params: { page, pageSize } });
  return res.data;
}

export async function getEvolution(page = 1, pageSize = 20): Promise<PaginatedResult<EvolutionEntry>> {
  const res = await apiClient.get<PaginatedResult<EvolutionEntry>>('/client/evolution', {
    params: { page, pageSize },
  });
  return res.data;
}

export async function getReports(): Promise<{ items: unknown[]; total: number }> {
  const res = await apiClient.get('/client/reports');
  return res.data;
}

// ---------------------------------------------------------------------------
// Fase 11 — Wearables e dispositivos
// ---------------------------------------------------------------------------

export async function acceptDeviceDataConsent(): Promise<void> {
  await apiClient.post('/client/devices/consent');
}

export async function listDeviceConnections(): Promise<DeviceConnectionsResponse> {
  const res = await apiClient.get<DeviceConnectionsResponse>('/client/devices');
  return res.data;
}

export async function createDeviceConnection(input: {
  sourceType: DeviceSourceType;
  driverId?: string;
  deviceIdentifier?: string;
  externalAccountId?: string;
}): Promise<DeviceConnection> {
  const res = await apiClient.post<DeviceConnection>('/client/devices', input);
  return res.data;
}

export async function setDeviceShareWithProfessional(
  connectionId: string,
  sharedWithProfessional: boolean,
): Promise<DeviceConnection> {
  const res = await apiClient.patch<DeviceConnection>(`/client/devices/${connectionId}`, { sharedWithProfessional });
  return res.data;
}

export async function revokeDeviceConnection(connectionId: string): Promise<DeviceConnection> {
  const res = await apiClient.patch<DeviceConnection>(`/client/devices/${connectionId}`, { status: 'revoked' });
  return res.data;
}

export async function ingestDeviceMetrics(
  connectionId: string,
  samples: MetricSampleInput[],
): Promise<IngestMetricsResult> {
  const res = await apiClient.post<IngestMetricsResult>(`/client/devices/${connectionId}/metrics`, { samples });
  return res.data;
}

export async function listOwnDeviceMetrics(connectionId: string): Promise<PaginatedResult<DeviceMetricSample>> {
  const res = await apiClient.get<PaginatedResult<DeviceMetricSample>>(`/client/devices/${connectionId}/metrics`, {
    params: { pageSize: 20 },
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// Fase 12 — IA assistiva
// ---------------------------------------------------------------------------

export async function acceptAiConsent(): Promise<void> {
  await apiClient.post('/client/ai/consent');
}

export async function explainEvaluation(evaluationId: string): Promise<AiGenerationResult> {
  const res = await apiClient.post<AiGenerationResult>('/client/ai/generate', {
    feature: 'explain_evaluation',
    evaluationId,
  });
  return res.data;
}

export async function narrateTrend(): Promise<AiGenerationResult> {
  const res = await apiClient.post<AiGenerationResult>('/client/ai/generate', { feature: 'narrate_trend' });
  return res.data;
}
