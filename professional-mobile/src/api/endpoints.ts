import { apiClient } from './client';
import type {
  AuthTokenPair,
  ClientListItem,
  ConfirmScaleReadingInput,
  EvaluationDetail,
  EvaluationListItem,
  PaginatedResult,
  ScaleReadingSummary,
} from '../types/api';

// Mesmo fluxo mobile do app do cliente (/auth/login, /refresh, /logout) —
// já é agnóstico de role no backend, reaproveitado sem nenhuma mudança
// (Fase 10, decisão §01).
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

export async function listClients(search?: string): Promise<PaginatedResult<ClientListItem>> {
  const res = await apiClient.get<PaginatedResult<ClientListItem>>('/clients', {
    params: search ? { search } : undefined,
  });
  return res.data;
}

export async function listEvaluations(clientId: string): Promise<PaginatedResult<EvaluationListItem>> {
  const res = await apiClient.get<PaginatedResult<EvaluationListItem>>(`/clients/${clientId}/evaluations`, {
    params: { pageSize: 50 },
  });
  return res.data;
}

export async function createEvaluation(clientId: string, heightCm: number): Promise<EvaluationDetail> {
  const res = await apiClient.post<EvaluationDetail>(`/clients/${clientId}/evaluations`, { heightCm });
  return res.data;
}

export async function confirmScaleReading(
  clientId: string,
  evaluationId: string,
  input: ConfirmScaleReadingInput,
): Promise<ScaleReadingSummary> {
  const res = await apiClient.post<ScaleReadingSummary>(
    `/clients/${clientId}/evaluations/${evaluationId}/scale-readings`,
    input,
  );
  return res.data;
}

export async function listScaleReadings(clientId: string, evaluationId: string): Promise<ScaleReadingSummary[]> {
  const res = await apiClient.get<ScaleReadingSummary[]>(
    `/clients/${clientId}/evaluations/${evaluationId}/scale-readings`,
  );
  return res.data;
}
