import { apiClient } from './client';
import type {
  AuthTokenPair,
  ClientSelf,
  CreateExecutionLogInput,
  DietClientSummary,
  EvolutionEntry,
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
