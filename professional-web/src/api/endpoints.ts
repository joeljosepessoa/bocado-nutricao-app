import { apiClient } from './client';
import type {
  ExerciseLibraryPage,
  ExercisePreset,
  WithoutGifItem,
  WorkoutHistorySession,
  CatalogExerciseRef,
  CatalogFoodRef,
  DietChatResult,
  TemplateChatMessage,
  WorkoutChatResult,
  DietTemplateContent,
  DietTemplateDetail,
  SaveTemplateInput,
  TemplateKind,
  TemplateSummary,
  WorkoutTemplateContent,
  WorkoutTemplateDetail,
  EvaluationSummaryRow,
  ReportOverviewItem,
  TrackingPhotos,
  TrackingWaterHistory,
  TrackingWeights,
  AdminModerationExercise,
  AdminModerationFood,
  AdminProfessional,
  AiGenerationResult,
  AiInteractionSummary,
  AnamnesisStatus,
  AnamnesisView,
  Appointment,
  AvailabilitySlot,
  ClientDetail,
  ClientListItem,
  ClientStatus,
  CreateClientInput,
  CreateWorkoutFromProposalInput,
  CreateDietFromProposalInput,
  CreateExerciseInput,
  CreateDietWithAiInput,
  CreateEvaluationInput,
  DashboardSummary,
  Diet,
  DietDayKind,
  DietVersionSummary,
  EvaluationComparison,
  EvaluationDetail,
  EvaluationListItem,
  EvolutionPoint,
  ExecutionLog,
  Exercise,
  Food,
  FoodDetails,
  FoodInput,
  FoodLibraryPage,
  MealGroupKind,
  Message,
  NutritionUnit,
  OrganizedWorkoutProposal,
  OrganizedDietProposal,
  PaginatedResult,
  Plan,
  PlatformMetrics,
  ReportAudience,
  ReportSummary,
  SaveAnamnesisInput,
  SessionUser,
  SignedUrl,
  Subscription,
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

/** O profissional altera o nome da própria conta (tela Configurações). */
export async function updateMyProfile(fullName: string): Promise<{ user: { fullName: string; email: string } }> {
  const res = await apiClient.patch('/professionals/me', { fullName });
  return res.data;
}

// Fase 13 — endpoint mobile-shaped (mesmo usado pelo app do cliente), sem
// cookie/sessão: o cadastro em si não estabelece a sessão do painel — a
// tela chama login() (fluxo web) logo em seguida.
export async function registerProfessional(input: {
  email: string;
  password: string;
  fullName: string;
  professionalRegister?: string;
}): Promise<void> {
  await apiClient.post('/auth/register-professional', input);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/request-password-reset', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, newPassword });
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

// --- Anamnese -----------------------------------------------------------

/** Situação da ficha de cada paciente (sem conteúdo). */
export async function listAnamneses(): Promise<AnamnesisStatus[]> {
  const res = await apiClient.get<AnamnesisStatus[]>('/anamneses');
  return res.data;
}

/** Tela "Avaliação" do menu: quantas avaliações cada paciente tem e quando foi a última. */
export async function listEvaluationSummary(): Promise<EvaluationSummaryRow[]> {
  const res = await apiClient.get<EvaluationSummaryRow[]>('/evaluations/summary');
  return res.data;
}

export async function getAnamnesis(clientId: string): Promise<AnamnesisView> {
  const res = await apiClient.get<AnamnesisView>(`/clients/${clientId}/anamnesis`);
  return res.data;
}

export async function saveAnamnesis(clientId: string, input: SaveAnamnesisInput): Promise<AnamnesisView> {
  const res = await apiClient.put<AnamnesisView>(`/clients/${clientId}/anamnesis`, input);
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

/** Tela "Alimentos": TACO + seus alimentos, com busca, grupo, origem e paginação. */
export async function listFoodLibrary(params: { search?: string; group?: string; origin?: string; page?: number; pageSize?: number }): Promise<FoodLibraryPage> {
  const res = await apiClient.get<FoodLibraryPage>('/foods/library', {
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
  });
  return res.data;
}

export async function getFoodDetails(id: string): Promise<FoodDetails> {
  const res = await apiClient.get<FoodDetails>(`/foods/${id}/details`);
  return res.data;
}

/** Alimento próprio: sempre particular (só você vê). */
export async function createFood(input: FoodInput): Promise<Food> {
  const res = await apiClient.post<Food>('/foods', { ...input, scope: 'private' });
  return res.data;
}

export async function updateFood(id: string, input: Partial<FoodInput>): Promise<Food> {
  const res = await apiClient.patch<Food>(`/foods/${id}`, input);
  return res.data;
}

export async function deleteFood(id: string): Promise<void> {
  await apiClient.delete(`/foods/${id}`);
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

export async function createMeal(
  clientId: string,
  dietId: string,
  versionId: string,
  input: { name: string; time?: string; notes?: string; dietDayId?: string },
) {
  const res = await apiClient.post(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals`, input);
  return res.data;
}

/** Proposta revisada do Assistente de Dieta → rascunho (nova dieta ou nova versão). Nunca publica. */
export async function createDietFromProposal(clientId: string, input: CreateDietFromProposalInput): Promise<Diet> {
  const res = await apiClient.post<Diet>(`/clients/${clientId}/diets/from-proposal`, input);
  return res.data;
}

/** "Excluir dieta" = arquivar: some do painel e do app, histórico preservado. */
export async function archiveDiet(clientId: string, dietId: string): Promise<Diet> {
  const res = await apiClient.patch<Diet>(`/clients/${clientId}/diets/${dietId}`, { status: 'archived' });
  return res.data;
}

export async function updateMeal(
  clientId: string,
  dietId: string,
  versionId: string,
  mealId: string,
  input: { name?: string; time?: string; notes?: string; order?: number },
) {
  const res = await apiClient.patch(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${mealId}`, input);
  return res.data;
}

export async function updateMealFood(
  clientId: string,
  dietId: string,
  versionId: string,
  mealId: string,
  mealFoodId: string,
  input: { quantity?: number; unit?: string; notes?: string; quantityMax?: number | null; isFreeQuantity?: boolean },
) {
  const res = await apiClient.patch(`/clients/${clientId}/diets/${dietId}/versions/${versionId}/meals/${mealId}/foods/${mealFoodId}`, input);
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

// --- Estrutura do rascunho (P1): dias, grupos, escolhas, itens, suplementos --

/** Referência ao rascunho em edição — toda mutação de estrutura é sobre ele. */
export interface DraftRef {
  clientId: string;
  dietId: string;
  versionId: string;
}

const draftBase = (ref: DraftRef) => `/clients/${ref.clientId}/diets/${ref.dietId}/versions/${ref.versionId}`;

export interface DietDayInput {
  label?: string;
  kind?: DietDayKind;
  usageNotes?: string;
  order?: number;
}

export async function createDietDay(ref: DraftRef, input: DietDayInput) {
  const res = await apiClient.post(`${draftBase(ref)}/days`, input);
  return res.data;
}

export async function updateDietDay(ref: DraftRef, dayId: string, input: DietDayInput) {
  const res = await apiClient.patch(`${draftBase(ref)}/days/${dayId}`, input);
  return res.data;
}

export async function deleteDietDay(ref: DraftRef, dayId: string) {
  await apiClient.delete(`${draftBase(ref)}/days/${dayId}`);
}

export async function createMealGroup(ref: DraftRef, mealId: string, input: { kind: MealGroupKind; label?: string; order?: number }) {
  const res = await apiClient.post(`${draftBase(ref)}/meals/${mealId}/groups`, input);
  return res.data;
}

export async function updateMealGroup(ref: DraftRef, mealId: string, groupId: string, input: { kind?: MealGroupKind; label?: string; order?: number }) {
  const res = await apiClient.patch(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}`, input);
  return res.data;
}

export async function deleteMealGroup(ref: DraftRef, mealId: string, groupId: string) {
  await apiClient.delete(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}`);
}

export async function createMealChoice(ref: DraftRef, mealId: string, groupId: string, input: { label?: string; order?: number }): Promise<{ id: string }> {
  const res = await apiClient.post(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}/choices`, input);
  return res.data;
}

export async function updateMealChoice(ref: DraftRef, mealId: string, groupId: string, choiceId: string, input: { label?: string; order?: number }) {
  const res = await apiClient.patch(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}/choices/${choiceId}`, input);
  return res.data;
}

export async function deleteMealChoice(ref: DraftRef, mealId: string, groupId: string, choiceId: string) {
  await apiClient.delete(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}/choices/${choiceId}`);
}

/** Item da escolha: do catálogo (foodId) OU nome livre (customFoodName, sem cálculo). */
export interface ChoiceFoodInput {
  foodId?: string;
  customFoodName?: string;
  quantity?: number;
  quantityMax?: number;
  unit?: NutritionUnit;
  isFreeQuantity?: boolean;
  notes?: string;
}

export async function addChoiceFood(ref: DraftRef, mealId: string, groupId: string, choiceId: string, input: ChoiceFoodInput) {
  const res = await apiClient.post(`${draftBase(ref)}/meals/${mealId}/groups/${groupId}/choices/${choiceId}/foods`, input);
  return res.data;
}

export interface DietSupplementInput {
  name?: string;
  quantity?: number;
  quantityMax?: number;
  unitText?: string;
  timing?: string;
  notes?: string;
  order?: number;
}

export async function createDietSupplement(ref: DraftRef, input: DietSupplementInput & { name: string }) {
  const res = await apiClient.post(`${draftBase(ref)}/supplements`, input);
  return res.data;
}

export async function updateDietSupplement(ref: DraftRef, supplementId: string, input: DietSupplementInput) {
  const res = await apiClient.patch(`${draftBase(ref)}/supplements/${supplementId}`, input);
  return res.data;
}

export async function deleteDietSupplement(ref: DraftRef, supplementId: string) {
  await apiClient.delete(`${draftBase(ref)}/supplements/${supplementId}`);
}

// --- Exercícios -----------------------------------------------------------

export async function listExercises(search?: string): Promise<Exercise[]> {
  const res = await apiClient.get<Exercise[]>('/exercises', { params: { search } });
  return res.data;
}

/** Tela "Exercícios": busca, filtros (grupo, equipamento) e paginação feitos no servidor. */
export async function listExerciseLibrary(params: { search?: string; group?: string; equipment?: string; page?: number; pageSize?: number }): Promise<ExerciseLibraryPage> {
  const res = await apiClient.get<ExerciseLibraryPage>('/exercises/library', {
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
  });
  return res.data;
}

/** Editar exercício (nome, grupos, equipamento). Oficial só para quem cuida do catálogo. */
export async function updateExercise(id: string, input: { name?: string; muscleGroups?: string[]; equipment?: string }): Promise<Exercise> {
  const res = await apiClient.patch<Exercise>(`/exercises/${id}`, input);
  return res.data;
}

/** Aba "Sem GIF": exercícios particulares sem GIF, com sugestões da biblioteca. */
export async function listExercisesWithoutGif(): Promise<WithoutGifItem[]> {
  const res = await apiClient.get<{ items: WithoutGifItem[] }>('/exercises/without-gif');
  return res.data.items;
}

/** O exercício particular passa a mostrar o GIF do exercício da biblioteca (nome e treinos não mudam). */
export async function linkLibraryGif(exerciseId: string, fromExerciseId: string): Promise<void> {
  await apiClient.post(`/exercises/${exerciseId}/gif`, { fromExerciseId });
}

export async function unlinkLibraryGif(exerciseId: string): Promise<void> {
  await apiClient.delete(`/exercises/${exerciseId}/gif`);
}

export async function listExercisePresets(): Promise<ExercisePreset[]> {
  const res = await apiClient.get<ExercisePreset[]>('/exercise-presets');
  return res.data;
}

export async function createExercisePreset(input: {
  exerciseId: string;
  sets: number;
  reps?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  restSeconds?: number | null;
}): Promise<ExercisePreset> {
  const res = await apiClient.post<ExercisePreset>('/exercise-presets', input);
  return res.data;
}

export async function deleteExercisePreset(id: string): Promise<void> {
  await apiClient.delete(`/exercise-presets/${id}`);
}

export async function createExercise(input: CreateExerciseInput): Promise<Exercise> {
  const res = await apiClient.post<Exercise>('/exercises', input);
  return res.data;
}

/** GIF de demonstração (autenticado, cacheável por hash) — `path` é o `imageUrl` relativo do exercício. */
export async function fetchExerciseMedia(path: string): Promise<Blob> {
  const res = await apiClient.get<Blob>(path, { responseType: 'blob' });
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

export interface WorkoutSetInput {
  reps?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  loadValue?: number | null;
  loadUnit?: string | null;
  restSeconds?: number | null;
  tempo?: string;
  notes?: string;
}

export async function addWorkoutSet(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  weId: string,
  input: WorkoutSetInput,
): Promise<WorkoutSet> {
  const res = await apiClient.post(
    `/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}/sets`,
    input,
  );
  return res.data;
}

export async function updateWorkoutSet(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  weId: string,
  setId: string,
  input: WorkoutSetInput,
): Promise<WorkoutSet> {
  const res = await apiClient.patch(
    `/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}/sets/${setId}`,
    input,
  );
  return res.data;
}

export async function deleteWorkoutSet(clientId: string, workoutId: string, versionId: string, dayId: string, weId: string, setId: string) {
  await apiClient.delete(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}/sets/${setId}`);
}

export async function updateWorkoutDay(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  input: { name?: string; notes?: string },
): Promise<WorkoutDay> {
  const res = await apiClient.patch(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}`, input);
  return res.data;
}

export async function reorderWorkoutDays(clientId: string, workoutId: string, versionId: string, dayIds: string[]): Promise<WorkoutVersion> {
  const res = await apiClient.patch(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days-order`, { dayIds });
  return res.data;
}

/** `exerciseId` troca o exercício por outro do catálogo (o backend confere a visibilidade). */
export async function updateWorkoutExercise(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  weId: string,
  input: { notes?: string; exerciseId?: string },
): Promise<WorkoutExercise> {
  const res = await apiClient.patch(`/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises/${weId}`, input);
  return res.data;
}

export async function reorderWorkoutExercises(
  clientId: string,
  workoutId: string,
  versionId: string,
  dayId: string,
  workoutExerciseIds: string[],
): Promise<WorkoutVersion> {
  const res = await apiClient.patch(
    `/clients/${clientId}/workouts/${workoutId}/versions/${versionId}/days/${dayId}/exercises-order`,
    { workoutExerciseIds },
  );
  return res.data;
}

/** "Excluir treino": arquiva — some do painel e do app, histórico e auditoria preservados. */
export async function archiveWorkout(clientId: string, workoutId: string): Promise<Workout> {
  const res = await apiClient.patch<Workout>(`/clients/${clientId}/workouts/${workoutId}`, { status: 'archived' });
  return res.data;
}

/** Proposta já revisada → treino NOVO em rascunho. Nunca publica. */
export async function createWorkoutFromProposal(clientId: string, input: CreateWorkoutFromProposalInput): Promise<Workout> {
  const res = await apiClient.post<Workout>(`/clients/${clientId}/workouts/from-proposal`, input);
  return res.data;
}

/** Histórico de treino do paciente: sessões (mais recentes primeiro) com as séries feitas. */
export async function getWorkoutHistory(clientId: string, limit = 120): Promise<{ sessions: WorkoutHistorySession[]; total: number }> {
  const res = await apiClient.get(`/clients/${clientId}/workouts/history`, { params: { limit } });
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

/** Tela "Relatórios" do menu: relatórios de todos os pacientes, do mais novo ao mais antigo. */
export async function listAllReports(pageSize = 100): Promise<PaginatedResult<ReportOverviewItem>> {
  const res = await apiClient.get<PaginatedResult<ReportOverviewItem>>('/reports', { params: { pageSize } });
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

// --- IA assistiva (Fase 12) -------------------------------------------

export async function acceptProfessionalAiConsent(): Promise<void> {
  await apiClient.post('/professionals/me/ai/consent');
}

export async function generateDraftNote(
  clientId: string,
  input: { instructions: string; entityType: 'evaluation' | 'diet' | 'workout' },
): Promise<AiGenerationResult> {
  const res = await apiClient.post<AiGenerationResult>(`/clients/${clientId}/ai/generate`, {
    feature: 'draft_note',
    ...input,
  });
  return res.data;
}

export async function explainEvaluation(clientId: string, evaluationId: string): Promise<AiGenerationResult> {
  const res = await apiClient.post<AiGenerationResult>(`/clients/${clientId}/ai/generate`, {
    feature: 'explain_evaluation',
    evaluationId,
  });
  return res.data;
}

export async function narrateTrend(clientId: string): Promise<AiGenerationResult> {
  const res = await apiClient.post<AiGenerationResult>(`/clients/${clientId}/ai/generate`, { feature: 'narrate_trend' });
  return res.data;
}

/** Assistente de Treino: organiza texto colado em proposta estruturada (nada é gravado). */
export async function organizeWorkout(
  clientId: string,
  workoutText: string,
): Promise<AiGenerationResult & { structuredData: OrganizedWorkoutProposal }> {
  const res = await apiClient.post<AiGenerationResult & { structuredData: OrganizedWorkoutProposal }>(
    `/clients/${clientId}/ai/generate`,
    { feature: 'organize_workout', workoutText },
  );
  return res.data;
}

/** Assistente de Dieta: organiza a dieta colada em proposta conferida (nada é gravado). */
export async function organizeDiet(
  clientId: string,
  dietText: string,
): Promise<AiGenerationResult & { structuredData: OrganizedDietProposal }> {
  const res = await apiClient.post<AiGenerationResult & { structuredData: OrganizedDietProposal }>(
    `/clients/${clientId}/ai/generate`,
    { feature: 'organize_diet', dietText },
  );
  return res.data;
}

/** Assistente de Dieta, modo "Deixar a IA montar": proposta só com alimentos do catálogo, calculada pelo sistema (nada é gravado). */
export async function createDietWithAi(
  clientId: string,
  input: CreateDietWithAiInput,
): Promise<AiGenerationResult & { structuredData: OrganizedDietProposal }> {
  const res = await apiClient.post<AiGenerationResult & { structuredData: OrganizedDietProposal }>(`/clients/${clientId}/ai/generate`, {
    feature: 'create_diet',
    ...input,
  });
  return res.data;
}

export async function listAiInteractions(clientId: string): Promise<PaginatedResult<AiInteractionSummary>> {
  const res = await apiClient.get<PaginatedResult<AiInteractionSummary>>(`/clients/${clientId}/ai/interactions`);
  return res.data;
}

// --- Modelos (biblioteca) -------------------------------------------------

const TEMPLATE_PATH: Record<TemplateKind, string> = { diet: '/templates/diets', workout: '/templates/workouts' };

export async function listTemplates(kind: TemplateKind, trash = false): Promise<TemplateSummary[]> {
  const res = await apiClient.get<TemplateSummary[]>(TEMPLATE_PATH[kind], { params: trash ? { trash: 'true' } : {} });
  return res.data;
}

export async function getDietTemplate(id: string): Promise<DietTemplateDetail> {
  const res = await apiClient.get<DietTemplateDetail>(`${TEMPLATE_PATH.diet}/${id}`);
  return res.data;
}

export async function getWorkoutTemplate(id: string): Promise<WorkoutTemplateDetail> {
  const res = await apiClient.get<WorkoutTemplateDetail>(`${TEMPLATE_PATH.workout}/${id}`);
  return res.data;
}

export async function createDietTemplate(input: SaveTemplateInput<DietTemplateContent>): Promise<TemplateSummary> {
  const res = await apiClient.post<TemplateSummary>(TEMPLATE_PATH.diet, input);
  return res.data;
}

export async function createWorkoutTemplate(input: SaveTemplateInput<WorkoutTemplateContent>): Promise<TemplateSummary> {
  const res = await apiClient.post<TemplateSummary>(TEMPLATE_PATH.workout, input);
  return res.data;
}

export async function updateDietTemplate(id: string, input: Partial<SaveTemplateInput<DietTemplateContent>>): Promise<TemplateSummary> {
  const res = await apiClient.patch<TemplateSummary>(`${TEMPLATE_PATH.diet}/${id}`, input);
  return res.data;
}

export async function updateWorkoutTemplate(id: string, input: Partial<SaveTemplateInput<WorkoutTemplateContent>>): Promise<TemplateSummary> {
  const res = await apiClient.patch<TemplateSummary>(`${TEMPLATE_PATH.workout}/${id}`, input);
  return res.data;
}

export async function duplicateTemplate(kind: TemplateKind, id: string): Promise<TemplateSummary> {
  const res = await apiClient.post<TemplateSummary>(`${TEMPLATE_PATH[kind]}/${id}/duplicate`);
  return res.data;
}

export async function deleteTemplate(kind: TemplateKind, id: string): Promise<void> {
  await apiClient.delete(`${TEMPLATE_PATH[kind]}/${id}`);
}

export async function restoreTemplate(kind: TemplateKind, id: string): Promise<TemplateSummary> {
  const res = await apiClient.post<TemplateSummary>(`${TEMPLATE_PATH[kind]}/${id}/restore`);
  return res.data;
}

/** Conversa com a IA no modelo de dieta: devolve a resposta e, se mudou, o modelo inteiro (nada é gravado). */
export async function templateDietChat(messages: TemplateChatMessage[], current: DietTemplateContent | null): Promise<DietChatResult> {
  const res = await apiClient.post<{ structuredData: DietChatResult }>('/templates/ai/diet', { messages, ...(current ? { current } : {}) });
  return res.data.structuredData;
}

/** Conversa com a IA no modelo de treino. */
export async function templateWorkoutChat(messages: TemplateChatMessage[], current: WorkoutTemplateContent | null): Promise<WorkoutChatResult> {
  const res = await apiClient.post<{ structuredData: WorkoutChatResult }>('/templates/ai/workout', { messages, ...(current ? { current } : {}) });
  return res.data.structuredData;
}

/** Dieta atual do paciente no formato do editor (rascunho, se houver; senão a publicada) e se ele autorizou a IA. */
export async function getClientDietContent(clientId: string): Promise<{ content: DietTemplateContent | null; foods: CatalogFoodRef[]; patientAiConsent: boolean }> {
  const res = await apiClient.get(`/clients/${clientId}/diet-content`);
  return res.data;
}

export async function getClientWorkoutContent(clientId: string): Promise<{ content: WorkoutTemplateContent | null; exercises: CatalogExerciseRef[]; patientAiConsent: boolean }> {
  const res = await apiClient.get(`/clients/${clientId}/workout-content`);
  return res.data;
}

/** Conversa com a IA sobre a dieta do paciente (usa idade, sexo, avaliação e anamnese; exige a autorização dele). */
export async function patientDietChat(clientId: string, messages: TemplateChatMessage[], current: DietTemplateContent | null): Promise<DietChatResult> {
  const res = await apiClient.post<{ structuredData: DietChatResult }>(`/clients/${clientId}/ai/diet-chat`, { messages, ...(current ? { current } : {}) });
  return res.data.structuredData;
}

export async function patientWorkoutChat(clientId: string, messages: TemplateChatMessage[], current: WorkoutTemplateContent | null): Promise<WorkoutChatResult> {
  const res = await apiClient.post<{ structuredData: WorkoutChatResult }>(`/clients/${clientId}/ai/workout-chat`, { messages, ...(current ? { current } : {}) });
  return res.data.structuredData;
}

/** "Salvar como modelo": copia a dieta/treino atual do paciente (rascunho, se houver; senão a publicada). */
export async function createTemplateFromClient(kind: TemplateKind, clientId: string, name: string, description?: string | null): Promise<TemplateSummary> {
  const res = await apiClient.post<TemplateSummary>(`${TEMPLATE_PATH[kind]}/from-client`, { clientId, name, ...(description ? { description } : {}) });
  return res.data;
}

/** Atribui o modelo ao paciente: vira RASCUNHO na ficha dele. Dieta com rascunho aberto responde 409 até confirmar `replaceDraft`. */
export async function applyTemplate(kind: TemplateKind, id: string, clientId: string, replaceDraft = false): Promise<void> {
  await apiClient.post(`${TEMPLATE_PATH[kind]}/${id}/apply`, { clientId, ...(replaceDraft ? { replaceDraft: true } : {}) });
}

// --- Administração (Fase 15) --------------------------------------------

export async function listAdminProfessionals(params: {
  search?: string;
  status?: 'all' | 'active' | 'suspended';
  page?: number;
} = {}): Promise<PaginatedResult<AdminProfessional>> {
  const res = await apiClient.get<PaginatedResult<AdminProfessional>>('/admin/professionals', { params });
  return res.data;
}

export async function suspendProfessional(id: string): Promise<AdminProfessional> {
  const res = await apiClient.post<AdminProfessional>(`/admin/professionals/${id}/suspend`);
  return res.data;
}

export async function reactivateProfessional(id: string): Promise<AdminProfessional> {
  const res = await apiClient.post<AdminProfessional>(`/admin/professionals/${id}/reactivate`);
  return res.data;
}

export async function listPendingFoods(): Promise<AdminModerationFood[]> {
  const res = await apiClient.get<AdminModerationFood[]>('/admin/moderation/foods');
  return res.data;
}

export async function listPendingExercises(): Promise<AdminModerationExercise[]> {
  const res = await apiClient.get<AdminModerationExercise[]>('/admin/moderation/exercises');
  return res.data;
}

export async function approveFood(id: string): Promise<AdminModerationFood> {
  const res = await apiClient.post<AdminModerationFood>(`/admin/moderation/foods/${id}/approve`);
  return res.data;
}

export async function rejectFood(id: string): Promise<void> {
  await apiClient.delete(`/admin/moderation/foods/${id}`);
}

export async function approveExercise(id: string): Promise<AdminModerationExercise> {
  const res = await apiClient.post<AdminModerationExercise>(`/admin/moderation/exercises/${id}/approve`);
  return res.data;
}

export async function rejectExercise(id: string): Promise<void> {
  await apiClient.delete(`/admin/moderation/exercises/${id}`);
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const res = await apiClient.get<PlatformMetrics>('/admin/metrics');
  return res.data;
}

// --- Mensagens (Fase 17) ------------------------------------------------

export async function listMessages(clientId: string): Promise<Message[]> {
  const res = await apiClient.get<Message[]>(`/clients/${clientId}/messages`);
  return res.data;
}

export async function sendMessage(clientId: string, body: string): Promise<Message> {
  const res = await apiClient.post<Message>(`/clients/${clientId}/messages`, { body });
  return res.data;
}

// --- Agenda e consultas (Fase 18) ---------------------------------------

export async function listAvailability(): Promise<AvailabilitySlot[]> {
  const res = await apiClient.get<AvailabilitySlot[]>('/professionals/me/availability');
  return res.data;
}

export async function createAvailabilitySlot(startAt: string, endAt: string): Promise<AvailabilitySlot> {
  const res = await apiClient.post<AvailabilitySlot>('/professionals/me/availability', { startAt, endAt });
  return res.data;
}

export async function removeAvailabilitySlot(id: string): Promise<void> {
  await apiClient.delete(`/professionals/me/availability/${id}`);
}

export async function listAppointments(): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/professionals/me/appointments');
  return res.data;
}

export async function confirmAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(`/professionals/me/appointments/${id}/confirm`);
  return res.data;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(`/professionals/me/appointments/${id}/cancel`);
  return res.data;
}

// --- Comercial: planos e assinaturas (Fase 22) ---------------------------

export async function listPlans(): Promise<Plan[]> {
  const res = await apiClient.get<Plan[]>('/professionals/me/billing/plans');
  return res.data;
}

export async function getSubscription(): Promise<Subscription | null> {
  const res = await apiClient.get<{ subscription: Subscription | null }>('/professionals/me/billing/subscription');
  return res.data.subscription;
}

export async function subscribeToPlan(planCode: string): Promise<Subscription> {
  const res = await apiClient.post<Subscription>('/professionals/me/billing/subscribe', { planCode });
  return res.data;
}

export async function cancelSubscription(): Promise<Subscription> {
  const res = await apiClient.post<Subscription>('/professionals/me/billing/cancel');
  return res.data;
}

export type { SessionUser };

// --- Acompanhamento (registros do paciente no app) ----------------------------

export async function getClientWeights(clientId: string): Promise<TrackingWeights> {
  const res = await apiClient.get<TrackingWeights>(`/clients/${clientId}/tracking/weights`);
  return res.data;
}

export async function getClientWater(clientId: string, days = 30): Promise<TrackingWaterHistory> {
  const res = await apiClient.get<TrackingWaterHistory>(`/clients/${clientId}/tracking/water`, { params: { days } });
  return res.data;
}

export async function getClientProgressPhotos(clientId: string): Promise<TrackingPhotos> {
  const res = await apiClient.get<TrackingPhotos>(`/clients/${clientId}/tracking/progress-photos`);
  return res.data;
}

export async function getClientProgressPhotoUrl(clientId: string, photoId: string): Promise<SignedUrl> {
  const res = await apiClient.get<SignedUrl>(`/clients/${clientId}/tracking/progress-photos/${photoId}/download-url`);
  return res.data;
}
