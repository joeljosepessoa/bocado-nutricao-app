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
  /** Metas definidas pelo nutricionista (null = sem meta). */
  targetWeightKg: number | null;
  waterGoalMl: number | null;
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
  targetWeightKg?: number | null;
  waterGoalMl?: number | null;
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

export type NutritionUnit = 'g' | 'ml' | 'unit' | 'tablespoon' | 'teaspoon' | 'cup' | 'slice';

/** Item de refeição. Na estrutura nova pode ser nome livre (sem catálogo), "à vontade" ou faixa de quantidade. */
export interface MealFood {
  id: string;
  foodId: string | null;
  customFoodName?: string | null;
  quantity: number | null;
  quantityMax?: number | null;
  isFreeQuantity?: boolean;
  unit: string | null;
  notes?: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  food?: { name: string } | null;
}

export interface Meal {
  id: string;
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  foods: MealFood[];
  totals?: { kcal: number; proteinG: number; carbG: number; fatG: number } | null;
}

// Estrutura nova (P1): dia → refeição → grupo → escolha → itens. A nutrição
// vem PRONTA da API, em faixa: opções/alternativas nunca são somadas entre si
// e dias diferentes nunca são somados. `partial` = algum item ficou fora da
// soma (à vontade, sem catálogo, sem quantidade ou sem conversão).

export type DietDayKind = 'training' | 'rest' | 'other';
export type MealGroupKind = 'fixed' | 'meal_options' | 'alternatives';

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
}

export interface NutritionRange {
  min: Nutrients;
  max: Nutrients;
  partial: boolean;
}

/** `id` nulo = nó montado pela API para dado ainda não convertido (não editável). */
export interface DietChoiceNode {
  id: string | null;
  label: string | null;
  order: number;
  foods: MealFood[];
  nutrition: NutritionRange;
}

export interface DietGroupNode {
  id: string | null;
  kind: MealGroupKind;
  label: string | null;
  order: number;
  choices: DietChoiceNode[];
  nutrition: NutritionRange;
}

export interface DietMealNode {
  id: string;
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  groups: DietGroupNode[];
  nutrition: NutritionRange;
}

export interface DietDayNode {
  id: string | null;
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  order: number;
  meals: DietMealNode[];
  nutrition: NutritionRange;
}

export interface DietSupplement {
  id: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string | null;
  timing: string | null;
  notes: string | null;
  order: number;
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
  /** Formato antigo (achatado), mantido pela API por compatibilidade. */
  meals: Meal[];
  /** Texto ao paciente — `notes` continua interno/profissional. */
  patientGuidelines?: string | null;
  days?: DietDayNode[];
  supplements?: DietSupplement[];
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
  /** null = catálogo oficial com marcador da TACO (Tr, NA, *, não analisado) — nunca 0. */
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbGPer100: number | null;
  fatGPer100: number | null;
  fiberGPer100: number | null;
}

// --- Assistente de Dieta ---------------------------------------------------

export type FoodMatchStatus = 'matched' | 'ambiguous' | 'not_found';

export interface CatalogFoodRef {
  id: string;
  name: string;
}

/** Item organizado pela IA e já conferido contra o texto (nada gravado ainda). */
export interface ProposalDietItem {
  sourceText: string;
  rawFood: string;
  quantity: number | null;
  /** Faixa "3 a 5 g": quantity = 3, quantityMax = 5. */
  quantityMax: number | null;
  /** "à vontade" escrito no texto. */
  freeQuantity: boolean;
  unitText: string | null;
  unit: NutritionUnit | null;
  notes: string | null;
  matchStatus: FoodMatchStatus;
  matchedFood: CatalogFoodRef | null;
  candidates: CatalogFoodRef[];
  warnings: string[];
}

export interface DietProposalChoice {
  label: string | null;
  items: ProposalDietItem[];
}

export interface DietProposalGroup {
  kind: MealGroupKind;
  label: string | null;
  choices: DietProposalChoice[];
}

export interface DietProposalMeal {
  name: string | null;
  time: string | null;
  notes: string | null;
  groups: DietProposalGroup[];
  warnings: string[];
}

export interface DietProposalDay {
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  meals: DietProposalMeal[];
  warnings: string[];
}

export interface DietProposalSupplement {
  sourceText: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string | null;
  timing: string | null;
  notes: string | null;
  warnings: string[];
}

/** Proposta organizada pela IA (organize_diet@v2) e já conferida contra o texto — nada gravado ainda. */
export interface OrganizedDietProposal {
  days: DietProposalDay[];
  supplements: DietProposalSupplement[];
  /** Orientações ao paciente copiadas literalmente do texto (no modo "montar": propostas pela IA). */
  guidelines: string[];
  warnings: string[];
  /** Só no modo "Deixar a IA montar" (create_diet). */
  mode?: 'create';
  /** Cálculo do SISTEMA sobre a proposta da IA (opções/"escolha 1" viram faixa). */
  nutrition?: { targetKcal: number | null; days: Array<{ label: string | null; min: Nutrients; max: Nutrients }> };
}

/** Pedido do modo "Deixar a IA montar": só o texto é obrigatório. */
export interface CreateDietWithAiInput {
  dietGoal: string;
  targetKcal?: number;
  mealsPerDay?: number;
}

export interface ProposalChoiceFoodInput {
  foodId?: string;
  customFoodName?: string;
  quantity?: number;
  quantityMax?: number;
  unit?: NutritionUnit;
  isFreeQuantity?: boolean;
  notes?: string | null;
}

/** Proposta revisada → rascunho. `days` (estrutura nova) OU `meals` (formato antigo). */
export interface CreateDietFromProposalInput {
  objective?: string;
  notes?: string;
  replaceDraft?: boolean;
  meals?: Array<{
    name: string;
    time?: string | null;
    notes?: string | null;
    foods: Array<{ foodId: string; quantity: number; unit: NutritionUnit; notes?: string | null }>;
  }>;
  days?: Array<{
    label?: string | null;
    kind?: DietDayKind;
    usageNotes?: string | null;
    meals: Array<{
      name: string;
      time?: string | null;
      notes?: string | null;
      groups: Array<{ kind: MealGroupKind; label?: string | null; choices: Array<{ label?: string | null; foods: ProposalChoiceFoodInput[] }> }>;
    }>;
  }>;
  supplements?: Array<{ name: string; quantity?: number; quantityMax?: number; unitText?: string | null; timing?: string | null; notes?: string | null }>;
  patientGuidelines?: string | null;
}

// --- Treinos --------------------------------------------------------------

export type WorkoutVersionStatus = 'draft' | 'published' | 'superseded';

export type LoadUnit = 'kg' | 'lb' | 'bodyweight' | 'band_level' | 'other';

export interface WorkoutSet {
  id: string;
  order: number;
  /** Prescrição exata; faixa usa repsMin/repsMax — nunca os dois. */
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes?: string | null;
}

export interface WorkoutExercise {
  id: string;
  order: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: string | null; equipment: string | null; imageUrl?: string | null };
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

export type AiFeatureKey = 'draft_note' | 'explain_evaluation' | 'narrate_trend' | 'organize_workout' | 'organize_diet' | 'create_diet';

/** Sempre rotulado como conteúdo assistivo — nunca um dado original do sistema. */
export interface AiGenerationResult {
  feature: AiFeatureKey;
  promptVersion: string;
  provider: string;
  model: string;
  text: string;
  /** Só em features de saída estruturada (já validada pelo backend). */
  structuredData?: unknown;
  generatedAt: string;
  isAiGenerated: true;
}

// --- Assistente de Treino (organizar treino existente) ---------------------

export interface CatalogExerciseRef {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  imageUrl: string | null;
}

export type ExerciseMatchStatus = 'matched' | 'ambiguous' | 'not_found';

export interface ProposalSet {
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface ProposalExercise {
  rawName: string;
  muscleGroupHint: string | null;
  notes: string | null;
  matchStatus: ExerciseMatchStatus;
  matchedExercise: CatalogExerciseRef | null;
  candidates: CatalogExerciseRef[];
  sets: ProposalSet[];
  warnings: string[];
}

export interface ProposalDay {
  name: string;
  notes: string | null;
  exercises: ProposalExercise[];
  warnings: string[];
}

export interface OrganizedWorkoutProposal {
  days: ProposalDay[];
  warnings: string[];
}

export interface CreateWorkoutFromProposalInput {
  objective?: string;
  notes?: string;
  days: Array<{
    name: string;
    notes: string | null;
    exercises: Array<{ exerciseId: string; notes: string | null; sets: ProposalSet[] }>;
  }>;
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
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbGPer100: number | null;
  fatGPer100: number | null;
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

// --- Mensagens (Fase 17) ------------------------------------------------

export type MessageSenderRole = 'professional' | 'client';

export interface Message {
  id: string;
  threadId: string;
  senderRole: MessageSenderRole;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// --- Agenda e consultas (Fase 18) ---------------------------------------

export interface AvailabilitySlot {
  id: string;
  professionalId: string;
  startAt: string;
  endAt: string;
  isBooked: boolean;
  createdAt: string;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled';

export interface Appointment {
  id: string;
  clientId: string;
  professionalId: string;
  slotId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  cancelledAt: string | null;
  createdAt: string;
  // Presente só na listagem do profissional (GET /professionals/me/appointments).
  client?: { id: string; user: { fullName: string } };
}

// --- Comercial: planos e assinaturas (Fase 22) ---------------------------

export type PlanInterval = 'month' | 'year';

export interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  interval: PlanInterval;
  trialDays: number;
  active: boolean;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type InvoiceStatus = 'open' | 'paid' | 'failed';

export interface Invoice {
  id: string;
  subscriptionId: string;
  amountCents: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  professionalId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  plan: Plan;
  invoices: Invoice[];
}
