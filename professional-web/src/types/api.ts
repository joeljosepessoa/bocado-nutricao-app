export type Role = 'professional' | 'client' | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface WebSession {
  accessToken: string;
  user: SessionUser;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Clientes ---------------------------------------------------------

export type ClientStatus = 'active' | 'inactive' | 'archived';

export interface ClientListItem {
  id: string;
  status: ClientStatus;
  createdAt: string;
  user: { email: string; fullName: string };
}

export interface ClientDetail {
  id: string;
  professionalId: string;
  birthDate: string | null;
  phone: string | null;
  gender: string | null;
  notes: string | null;
  status: ClientStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { email: string; fullName: string };
}

export interface CreateClientInput {
  email: string;
  fullName: string;
  phone?: string;
  gender?: string;
  birthDate?: string;
}

export interface UpdateClientInput {
  email?: string;
  fullName?: string;
  phone?: string;
  gender?: string;
  birthDate?: string;
  notes?: string;
  status?: ClientStatus;
}

// --- Avaliação física ---------------------------------------------------

export interface Measurements {
  chestCm: number | null;
  waistCm: number | null;
  abdomenCm: number | null;
  hipCm: number | null;
  armRightCm: number | null;
  armLeftCm: number | null;
  forearmRightCm: number | null;
  forearmLeftCm: number | null;
  thighRightCm: number | null;
  thighLeftCm: number | null;
  calfRightCm: number | null;
  calfLeftCm: number | null;
  wristCm: number | null;
  femurBicondylarCm: number | null;
}

export interface Skinfolds {
  chestMm: number | null;
  axillaryMidMm: number | null;
  subscapularMm: number | null;
  bicepsMm: number | null;
  tricepsMm: number | null;
  abdominalMm: number | null;
  suprailiacMm: number | null;
  thighMm: number | null;
  calfMm: number | null;
}

export interface Bioimpedance {
  origin: 'manual' | 'device_confirmed';
  recordedAt: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  muscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
  boneMassKg: number | null;
}

export interface CalculatedMetrics {
  bmi: number | null;
  bmiClassification: string | null;
  waistHipRatio: number | null;
  bodyFatPercent: number | null;
  bodyFatPercentSource: 'skinfolds' | 'bioimpedance' | 'manual' | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  protocolVersionUsed: string | null;
}

export interface BodyPhoto {
  id: string;
  angle: 'front' | 'side_right' | 'back' | 'side_left';
  contentType: string;
  capturedAt: string | null;
  createdAt: string;
}

export interface Protocol {
  id: string;
  code: string;
  name: string;
  version: number;
  requiredSkinfoldSites: string[];
}

export interface EvaluationListItem {
  id: string;
  evaluatedAt: string;
  weightKg: number | null;
  createdAt: string;
  calculatedMetrics: { bmi: number | null; bodyFatPercent: number | null; bodyFatPercentSource: string | null } | null;
}

export interface EvaluationDetail {
  id: string;
  clientId: string;
  professionalId: string;
  evaluatedAt: string;
  ageAtEvaluation: number | null;
  biologicalSexForCalculation: 'male' | 'female' | null;
  heightCm: number;
  weightKg: number | null;
  protocolId: string | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  glucose: number | null;
  notes: string | null;
  releasedToClientAt: string | null;
  createdAt: string;
  updatedAt: string;
  measurements: Measurements | null;
  skinfolds: Skinfolds | null;
  bioimpedance: Bioimpedance | null;
  calculatedMetrics: CalculatedMetrics | null;
  protocol: Protocol | null;
  photos: BodyPhoto[];
}

export interface CreateEvaluationInput {
  evaluatedAt?: string;
  ageAtEvaluation?: number;
  biologicalSexForCalculation?: 'male' | 'female';
  heightCm: number;
  weightKg?: number;
  protocolCode?: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  glucose?: number;
  notes?: string;
  measurements?: Partial<Measurements>;
  skinfolds?: Partial<Skinfolds>;
  bioimpedance?: Partial<Record<keyof Bioimpedance, number>>;
}

export type UpdateEvaluationInput = Partial<CreateEvaluationInput>;

export interface EvolutionPoint {
  id: string;
  evaluatedAt: string;
  releasedToClientAt: string | null;
  weightKg: number | null;
  bmi: number | null;
  bmiClassification: string | null;
  bodyFatPercent: number | null;
  bodyFatPercentSource: string | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  measurements: Measurements | null;
  skinfoldSumMm: number | null;
  protocolCode: string | null;
  protocolVersion: number | null;
  bioimpedance: Bioimpedance | null;
}

export interface EvaluationComparison {
  from: EvaluationDetail;
  to: EvaluationDetail;
  deltas: Record<string, number | null>;
  deltasPercent: Record<string, number | null>;
  bodyFatSourceChanged: boolean;
}

// --- Dietas -------------------------------------------------------------

export type DietVersionStatus = 'draft' | 'published' | 'superseded';

export interface MealFood {
  id: string;
  foodId: string;
  quantity: number;
  unit: string;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  food?: { name: string };
}

export interface Meal {
  id: string;
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  foods: MealFood[];
  totals?: { kcal: number; proteinG: number; carbG: number; fatG: number };
}

export interface DietVersion {
  id: string;
  dietId: string;
  versionNumber: number;
  status: DietVersionStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  objective: string | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbG: number | null;
  targetFatG: number | null;
  publishedAt: string | null;
  supersededAt: string | null;
  meals: Meal[];
}

export interface DietVersionSummary {
  id: string;
  versionNumber: number;
  status: DietVersionStatus;
  publishedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
}

export interface Diet {
  id: string;
  clientId: string;
  status: 'active' | 'archived';
  versions: DietVersionSummary[];
  currentVersion: DietVersion | null;
}

export interface Food {
  id: string;
  name: string;
  scope: 'global' | 'private';
  baseUnit: string;
  kcalPer100: number;
  proteinGPer100: number;
  carbGPer100: number;
  fatGPer100: number;
  fiberGPer100: number | null;
}

// --- Treinos --------------------------------------------------------------

export type WorkoutVersionStatus = 'draft' | 'published' | 'superseded';

export interface WorkoutSet {
  id: string;
  order: number;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
}

export interface WorkoutExercise {
  id: string;
  order: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: string | null; equipment: string | null };
  sets: WorkoutSet[];
}

export interface WorkoutDay {
  id: string;
  name: string;
  order: number;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutVersion {
  id: string;
  workoutId: string;
  versionNumber: number;
  status: WorkoutVersionStatus;
  objective: string | null;
  notes: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  days: WorkoutDay[];
}

export interface WorkoutVersionSummary {
  id: string;
  versionNumber: number;
  status: WorkoutVersionStatus;
  publishedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
}

export interface Workout {
  id: string;
  clientId: string;
  status: 'active' | 'archived';
  versions: WorkoutVersionSummary[];
  currentVersion: WorkoutVersion | null;
}

export interface Exercise {
  id: string;
  name: string;
  type: string;
  muscleGroup: string | null;
  equipment: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  scope: 'global' | 'private';
}

export interface ExecutionLog {
  id: string;
  performedAt: string;
  notes: string | null;
  loggedByProfessionalId: string | null;
  // A listagem não inclui as séries (só o detalhe de um execution log específico traz `sets`).
  sets?: Array<{ workoutExerciseId: string; setOrder: number; repsPerformed: number | null; loadValue: number | null }>;
}

// --- Dashboard --------------------------------------------------------

export interface DashboardSummary {
  clients: { total: number; active: number; archived: number };
  evaluations: { last30Days: number; pendingRelease: number };
  diets: { active: number };
  workouts: { active: number };
  recentActivity: Array<{
    type: 'evaluation_created' | 'diet_published' | 'workout_published';
    clientId: string;
    clientName: string;
    occurredAt: string;
  }>;
}

// --- Relatórios ---------------------------------------------------------

export type ReportAudience = 'professional' | 'client';
export type ReportStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface ReportSummary {
  id: string;
  evaluationId: string;
  audience: ReportAudience;
  status: ReportStatus;
  templateVersion: number;
  sizeBytes: number | null;
  generatedAt: string | null;
  releasedToClientAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

// --- IA assistiva (Fase 12) -----------------------------------------------

export type AiFeatureKey = 'draft_note' | 'explain_evaluation' | 'narrate_trend';

/** Sempre rotulado como conteúdo assistivo — nunca um dado original do sistema. */
export interface AiGenerationResult {
  feature: AiFeatureKey;
  promptVersion: string;
  provider: string;
  model: string;
  text: string;
  generatedAt: string;
  isAiGenerated: true;
}

export interface AiInteractionSummary {
  id: string;
  feature: AiFeatureKey;
  provider: string;
  model: string;
  promptVersion: string;
  contextRef: string | null;
  status: string;
  responseText: string | null;
  createdAt: string;
}

// --- Administração (Fase 15) -------------------------------------------

export interface AdminProfessional {
  id: string;
  professionalRegister: string | null;
  user: { email: string; fullName: string; suspendedAt: string | null; createdAt: string };
}

export interface AdminModerationFood {
  id: string;
  name: string;
  kcalPer100: number;
  proteinGPer100: number;
  carbGPer100: number;
  fatGPer100: number;
  source: string;
  createdAt: string;
}

export interface AdminModerationExercise {
  id: string;
  name: string;
  type: string;
  muscleGroup: string | null;
  equipment: string | null;
  createdAt: string;
}

export interface PlatformMetrics {
  professionals: { total: number; suspended: number };
  clients: { total: number };
  evaluations: { total: number };
  diets: { total: number };
  workouts: { total: number };
  foods: { globalApproved: number; globalPending: number };
  exercises: { globalApproved: number; globalPending: number };
}
