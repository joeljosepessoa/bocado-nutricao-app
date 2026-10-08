import { apiClient } from './client';
import type {
  AiGenerationResult,
  Appointment,
  AuthTokenPair,
  AvailabilitySlot,
  ClientDataExport,
  ClientReportSummary,
  ClientSelf,
  CreateExecutionLogInput,
  DeviceConnection,
  DeviceConnectionsResponse,
  DeviceMetricSample,
  DeviceSourceType,
  DietClientSummary,
  EvolutionEntry,
  IngestMetricsResult,
  Message,
  MetricSampleInput,
  NotificationEventType,
  NotificationPreference,
  PaginatedResult,
  SignedUrl,
  ProgressPhoto,
  WaterDay,
  WaterHistory,
  WeightEntry,
  WeightList,
  WorkoutClientSummary,
  WorkoutExecutionRecord,
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
): Promise<PaginatedResult<WorkoutExecutionRecord>> {
  const res = await apiClient.get('/client/workout/execution-logs', { params: { page, pageSize } });
  return res.data;
}

export async function getEvolution(page = 1, pageSize = 20): Promise<PaginatedResult<EvolutionEntry>> {
  const res = await apiClient.get<PaginatedResult<EvolutionEntry>>('/client/evolution', {
    params: { page, pageSize },
  });
  return res.data;
}

export async function getReports(page = 1, pageSize = 20): Promise<PaginatedResult<ClientReportSummary>> {
  const res = await apiClient.get<PaginatedResult<ClientReportSummary>>('/client/reports', { params: { page, pageSize } });
  return res.data;
}

export async function getReportDownloadUrl(reportId: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/client/reports/${reportId}/download-url`);
  return res.data;
}

/** URL assinada (curta duração, `/files/:token` público) de uma foto de uma avaliação liberada. */
export async function getEvaluationPhotoUrl(evaluationId: string, photoId: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/client/evolution/${evaluationId}/photos/${photoId}/download-url`);
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

export interface AiConsentState {
  /** ISO da data/hora da autorização; null = não autorizado. */
  aiDataProcessingConsentAt: string | null;
}

export async function getAiConsent(): Promise<AiConsentState> {
  const res = await apiClient.get<AiConsentState>('/client/ai/consent');
  return res.data;
}

export async function acceptAiConsent(): Promise<void> {
  await apiClient.post('/client/ai/consent');
}

export async function revokeAiConsent(): Promise<void> {
  await apiClient.delete('/client/ai/consent');
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

// ---------------------------------------------------------------------------
// Fase 16 — Notificações
// ---------------------------------------------------------------------------

export async function registerDeviceToken(platform: 'ios' | 'android', token: string): Promise<void> {
  await apiClient.post('/notifications/device-tokens', { platform, token });
}

export async function revokeDeviceToken(token: string): Promise<void> {
  await apiClient.post('/notifications/device-tokens/revoke', { token });
}

export async function listNotificationPreferences(): Promise<NotificationPreference[]> {
  const res = await apiClient.get<NotificationPreference[]>('/notifications/preferences');
  return res.data;
}

export async function updateNotificationPreference(eventType: NotificationEventType, enabled: boolean): Promise<NotificationPreference> {
  const res = await apiClient.patch<NotificationPreference>('/notifications/preferences', { eventType, enabled });
  return res.data;
}

// ---------------------------------------------------------------------------
// Fase 17 — Comunicação
// ---------------------------------------------------------------------------

export async function getMessages(): Promise<Message[]> {
  const res = await apiClient.get<Message[]>('/client/messages');
  return res.data;
}

export async function sendMessage(body: string): Promise<Message> {
  const res = await apiClient.post<Message>('/client/messages', { body });
  return res.data;
}

// ---------------------------------------------------------------------------
// Fase 18 — Agenda e consultas
// ---------------------------------------------------------------------------

export async function getAvailability(): Promise<AvailabilitySlot[]> {
  const res = await apiClient.get<AvailabilitySlot[]>('/client/availability');
  return res.data;
}

export async function bookAppointment(slotId: string, notes?: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>('/client/appointments', { slotId, notes });
  return res.data;
}

export async function getAppointments(): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/client/appointments');
  return res.data;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(`/client/appointments/${id}/cancel`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Fase 19 — LGPD operacional
// ---------------------------------------------------------------------------

export async function exportMyData(): Promise<ClientDataExport> {
  const res = await apiClient.post<ClientDataExport>('/client/data-export');
  return res.data;
}

export async function deleteMyAccount(currentPassword: string): Promise<void> {
  await apiClient.post('/client/account-deletion', { currentPassword });
}

// ---------------------------------------------------------------------------
// Registros do próprio paciente: peso, água e fotos de progresso
// ---------------------------------------------------------------------------

/** Pesos reais (registros do app + avaliações liberadas); `days` limita ao período recente. */
export async function getWeights(days?: number): Promise<WeightList> {
  const res = await apiClient.get<WeightList>('/client/weights', { params: days ? { days } : undefined });
  return res.data;
}

export async function addWeight(weightKg: number, recordedAt?: string): Promise<WeightEntry> {
  const res = await apiClient.post<WeightEntry>('/client/weights', { weightKg, ...(recordedAt ? { recordedAt } : {}) });
  return res.data;
}

export async function deleteWeight(id: string): Promise<void> {
  await apiClient.delete(`/client/weights/${id}`);
}

/** `date` é o dia no calendário do aparelho (AAAA-MM-DD). */
export async function getWaterDay(date: string): Promise<WaterDay> {
  const res = await apiClient.get<WaterDay>('/client/water', { params: { date } });
  return res.data;
}

export async function addWater(amountMl: number, date: string): Promise<WaterDay> {
  const res = await apiClient.post<WaterDay>('/client/water', { amountMl, date });
  return res.data;
}

export async function deleteWaterEntry(id: string): Promise<WaterDay> {
  const res = await apiClient.delete<WaterDay>(`/client/water/${id}`);
  return res.data;
}

export async function resetWaterDay(date: string): Promise<WaterDay> {
  const res = await apiClient.delete<WaterDay>('/client/water', { params: { date } });
  return res.data;
}

export async function getWaterHistory(days = 30): Promise<WaterHistory> {
  const res = await apiClient.get<WaterHistory>('/client/water/history', { params: { days } });
  return res.data;
}

export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  const res = await apiClient.get<ProgressPhoto[]>('/client/progress-photos');
  return res.data;
}

export async function uploadProgressPhoto(file: { uri: string; mimeType: string; name: string }, takenAt?: string): Promise<ProgressPhoto> {
  const form = new FormData();
  // React Native aceita { uri, type, name } como arquivo no FormData.
  form.append('file', { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);
  if (takenAt) form.append('takenAt', takenAt);
  const res = await apiClient.post<ProgressPhoto>('/client/progress-photos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getProgressPhotoUrl(id: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/client/progress-photos/${id}/download-url`);
  return res.data;
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  await apiClient.delete(`/client/progress-photos/${id}`);
}
