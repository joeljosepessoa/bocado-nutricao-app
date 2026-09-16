import { apiClient } from './client';
import type {
  ClientDetail,
  ClientListItem,
  ClientStatus,
  CreateClientInput,
  CreateEvaluationInput,
  DashboardSummary,
  Diet,
  DietVersionSummary,
  EvaluationComparison,
  EvaluationDetail,
  EvaluationListItem,
  EvolutionPoint,
  ExecutionLog,
  Exercise,
  Food,
  PaginatedResult,
  ReportAudience,
  ReportSummary,
  SessionUser,
  SignedUrl,
  UpdateClientInput,
  UpdateEvaluationInput,
  WebSession,
  Workout,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSet,
  WorkoutVersion,
} from '../types/api';

// --- Autenticação ---------------------------------------------------------

export async function login(email: string, password: string): Promise<WebSession> {
  const res = await apiClient.post<WebSession>('/auth/web/login', { email, password });
  return res.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/web/logout');
}

export async function refresh(): Promise<WebSession> {
  const res = await apiClient.post<WebSession>('/auth/web/refresh');
  return res.data;
}

export async function getMe(): Promise<{ user: { fullName: string; email: string } }> {
  const res = await apiClient.get('/professionals/me');
  return res.data;
}

// --- Dashboard --------------------------------------------------------

export async function getDashboard(): Promise<DashboardSummary> {
  const res = await apiClient.get<DashboardSummary>('/professionals/me/dashboard');
  return res.data;
}

// --- Clientes ---------------------------------------------------------

export async function listClients(params: {
  search?: string;
  status?: ClientStatus | 'all';
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResult<ClientListItem>> {
  const res = await apiClient.get<PaginatedResult<ClientListItem>>('/clients', { params });
  return res.data;
}

export async function getClient(clientId: string): Promise<ClientDetail> {
  const res = await apiClient.get<ClientDetail>(`/clients/${clientId}`);
  return res.data;
}

export async function createClient(input: CreateClientInput): Promise<{ client: ClientDetail; temporaryPassword: string }> {
  const res = await apiClient.post('/professionals/me/clients', input);
  return res.data;
}

export async function updateClient(clientId: string, input: UpdateClientInput): Promise<ClientDetail> {
  const res = await apiClient.patch<ClientDetail>(`/clients/${clientId}`, input);
  return res.data;
}

export async function resetClientPassword(clientId: string): Promise<{ temporaryPassword: string }> {
  const res = await apiClient.post(`/professionals/me/clients/${clientId}/reset-password`);
  return res.data;
}

// --- Avaliações físicas -------------------------------------------------

export async function listEvaluations(
  clientId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<EvaluationListItem>> {
  const res = await apiClient.get<PaginatedResult<EvaluationListItem>>(`/clients/${clientId}/evaluations`, {
    params: { page, pageSize },
  });
  return res.data;
}

export async function getEvaluation(clientId: string, evaluationId: string): Promise<EvaluationDetail> {
  const res = await apiClient.get<EvaluationDetail>(`/clients/${clientId}/evaluations/${evaluationId}`);
  return res.data;
}

export async function createEvaluation(clientId: string, input: CreateEvaluationInput): Promise<EvaluationDetail> {
  const res = await apiClient.post<EvaluationDetail>(`/clients/${clientId}/evaluations`, input);
  return res.data;
}

export async function updateEvaluation(
  clientId: string,
  evaluationId: string,
  input: UpdateEvaluationInput,
): Promise<EvaluationDetail> {
  const res = await apiClient.patch<EvaluationDetail>(`/clients/${clientId}/evaluations/${evaluationId}`, input);
  return res.data;
}

export async function setEvaluationRelease(
  clientId: string,
  evaluationId: string,
  released: boolean,
): Promise<{ id: string; releasedToClientAt: string | null }> {
  const res = await apiClient.patch(`/clients/${clientId}/evaluations/${evaluationId}/release`, { released });
  return res.data;
}

export async function compareEvaluations(clientId: string, fromId: string, toId: string): Promise<EvaluationComparison> {
  const res = await apiClient.get<EvaluationComparison>(`/clients/${clientId}/evaluations/compare`, {
    params: { from: fromId, to: toId },
  });
  return res.data;
}

export async function getEvolutionSeries(clientId: string): Promise<EvolutionPoint[]> {
  const res = await apiClient.get<EvolutionPoint[]>(`/clients/${clientId}/evaluations/evolution`);
  return res.data;
}

export async function uploadEvaluationPhoto(
  clientId: string,
  evaluationId: string,
  angle: string,
  file: File,
): Promise<{ id: string; angle: string }> {
  const form = new FormData();
  form.append('angle', angle);
  form.append('file', file);
  const res = await apiClient.post(`/clients/${clientId}/evaluations/${evaluationId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getEvaluationPhotoUrl(clientId: string, evaluationId: string, photoId: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/clients/${clientId}/evaluations/${evaluationId}/photos/${photoId}`);
  return res.data;
}

export async function deleteEvaluationPhoto(clientId: string, evaluationId: string, photoId: string): Promise<void> {
  await apiClient.delete(`/clients/${clientId}/evaluations/${evaluationId}/photos/${photoId}`);
}

// --- Alimentos ----------------------------------------------------------

export async function listFoods(search?: string): Promise<Food[]> {
  const res = await apiClient.get<Food[]>('/foods', { params: { search } });
  return res.data;
}

// --- Dietas -------------------------------------------------------------

export async function listDiets(clientId: string): Promise<PaginatedResult<{ id: string; status: string; createdAt: string }>> {
  const res = await apiClient.get(`/clients/${clientId}/diets`);
  return res.data;
}

export async function createDiet(clientId: string): Promise<Diet> {
  const res = await apiClient.post<Diet>(`/clients/${clientId}/diets`, {});
  return res.data;
}

export async function getDiet(clientId: string, dietId: string): Promise<Diet> {
  const res = await apiClient.get<Diet>(`/clients/${clientId}/diets/${dietId}`);
  return res.data;
}

export async function listDietVersions(clientId: string, dietId: string): Promise<DietVersionSummary[]> {
  const res = await apiClient.get<DietVersionSummary[]>(`/clients/${clientId}/diets/${dietId}/versions`);
  return res.data;
}

export async function getDietVersion(clientId: string, dietId: string, versionId: string) {
  const res = await apiClient.get(`/clients/${clientId}/diets/${dietId}/versions/${versionId}`);
  return res.data;
}

export async function createDietVersion(clientId: string, dietId: string) {
  const res = await apiClient.post(`/clients/${clientId}/diets/${dietId}/versions`, {});
  return res.data;
}

export async function updateDietVersion(clientId: string, dietId: string, versionId: string, input: Record<string, unknown>) {
  const res = await apiClient.patch(`/clients/${clientId}/diets/${dietId}/versions/${versionId}`, input);
  return res.data;
}

export async function publishDietVersion(clientId: string, dietId: string, versionId: string) {
  const res = await apiClient.post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/publish`);
  return res.data;
}

export async function createMeal(clientId: string, dietId: string, versionId: string, input: { name: string; time?: string; notes?: string }) {
  const res = await apiClient.post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals`, input);
  return res.data;
}

export async function deleteMeal(clientId: string, dietId: string, versionId: string, mealId: string) {
  await apiClient.delete(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${mealId}`);
}

export async function addMealFood(
  clientId: string,
  dietId: string,
  versionId: string,
  mealId: string,
  input: { foodId: string; quantity: number; unit: string },
) {
  const res = await apiClient.post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${mealId}/foods`, input);
  return res.data;
}

export async function deleteMealFood(clientId: string, dietId: string, versionId: string, mealId: string, mealFoodId: string) {
  await apiClient.delete(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${mealId}/foods/${mealFoodId}`);
}

// --- Exercícios -----------------------------------------------------------

export async function listExercises(search?: string): Promise<Exercise[]> {
  const res = await apiClient.get<Exercise[]>('/exercises', { params: { search } });
  return res.data;
}

// --- Treinos ----------------------------------------------------------

export async function listWorkouts(
  clientId: string,
): Promise<PaginatedResult<{ id: string; status: string; createdAt: string }>> {
  const res = await apiClient.get(`/clients/${clientId}/workouts`);
  return res.data;
}

export async function createWorkout(clientId: string): Promise<Workout> {
  const res = await apiClient.post<Workout>(`/clients/${clientId}/workouts`, {});
  return res.data;
}

export async function getWorkout(clientId: string, workoutId: string): Promise<Workout> {
  const res = await apiClient.get<Workout>(`/clients/${clientId}/workouts/${workoutId}`);
  return res.data;
}

export async function getWorkoutVersion(clientId: string, workoutId: string, versionId: string): Promise<WorkoutVersion> {
  const res = await apiClient.get<WorkoutVersion>(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}`);
  return res.data;
}

export async function createWorkoutVersion(clientId: string, workoutId: string) {
  const res = await apiClient.post(`/clients/${clientId}/workouts/${workoutId}/versions`, {});
  return res.data;
}

export async function publishWorkoutVersion(clientId: string, workoutId: string, versionId: string) {
  const res = await apiClient.post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/publish`);
  return res.data;
}

export async function createWorkoutDay(
  clientId: string,
  workoutId: string,
  versionId: string,
  input: { name: string },
): Promise<WorkoutDay> {
  const res = await apiClient.post(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days`, input);
  return res.data;
}

export async function deleteWorkoutDay(clientId: string, workoutId: string, versionId: string, dayId: string) {
  await apiClient.delete(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}`);
}

export async function addWorkoutExercise(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  input: { exerciseId: string },
): Promise<WorkoutExercise> {
  const res = await apiClient.post(
    `/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises`,
    input,
  );
  return res.data;
}

export async function deleteWorkoutExercise(clientId: string, workoutId: string, versionId: string, dayId: string, weId: string) {
  await apiClient.delete(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}`);
}

export async function addWorkoutSet(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  weId: string,
  input: { reps?: number; loadValue?: number; loadUnit?: string; restSeconds?: number },
): Promise<WorkoutSet> {
  const res = await apiClient.post(
    `/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}/sets`,
    input,
  );
  return res.data;
}

export async function listExecutionLogs(clientId: string, workoutId: string): Promise<PaginatedResult<ExecutionLog>> {
  const res = await apiClient.get(`/clients/${clientId}/workouts/${workoutId}/execution-logs`);
  return res.data;
}

// --- Relatórios ---------------------------------------------------------

export async function listReports(
  clientId: string,
  filters: { evaluationId?: string; audience?: ReportAudience } = {},
): Promise<PaginatedResult<ReportSummary>> {
  const res = await apiClient.get<PaginatedResult<ReportSummary>>(`/clients/${clientId}/reports`, { params: filters });
  return res.data;
}

export async function generateReport(
  clientId: string,
  evaluationId: string,
  audience: ReportAudience,
): Promise<ReportSummary> {
  const res = await apiClient.post<ReportSummary>(`/clients/${clientId}/evaluations/${evaluationId}/reports`, { audience });
  return res.data;
}

export async function getReportDownloadUrl(clientId: string, reportId: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/clients/${clientId}/reports/${reportId}/download-url`);
  return res.data;
}

export async function setReportRelease(clientId: string, reportId: string, released: boolean): Promise<ReportSummary> {
  const res = await apiClient.patch<ReportSummary>(`/clients/${clientId}/reports/${reportId}/release`, { released });
  return res.data;
}

export async function deleteReport(clientId: string, reportId: string): Promise<void> {
  await apiClient.delete(`/clients/${clientId}/reports/${reportId}`);
}

export type { SessionUser };
