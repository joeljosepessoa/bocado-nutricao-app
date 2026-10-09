export type Role = 'professional' | 'client';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  privacyAcceptedAt: string | null;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface ClientSelf {
  id: string;
  birthDate: string | null;
  phone: string | null;
  gender: string | null;
  /** Metas preenchidas pelo nutricionista na ficha (null = sem meta; ausentes em APIs anteriores). */
  targetWeightKg?: number | null;
  waterGoalMl?: number | null;
  user: { email: string; fullName: string };
}

export interface SubstitutionOption {
  substituteFoodId: string;
  substituteFoodName: string;
  substituteQuantity: number;
  substituteUnit: string;
  substituteKcal: number | null;
  substituteProteinG: number | null;
  substituteCarbG: number | null;
  substituteFatG: number | null;
}

/** Formato ANTIGO (achatado) — ainda enviado pela API para APKs antigos. */
export interface DietClientMealFood {
  foodName: string;
  quantity: number | null;
  unit: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  substitutions: SubstitutionOption[];
}

export interface DietClientMeal {
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  foods: DietClientMealFood[];
}

// --- Formato NOVO: dias → refeições → grupos → escolhas → alimentos ---------
// A nutrição vem PRONTA da API, em faixa: opções/alternativas nunca são somadas
// e dias diferentes nunca são somados. `partial` = algum item ficou fora da soma.

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

export interface DietClientFoodItem {
  foodName: string;
  /** Fora do catálogo — sem cálculo nutricional. */
  isCustom: boolean;
  quantity: number | null;
  quantityMax: number | null;
  isFreeQuantity: boolean;
  unit: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  /** Observação do item para o paciente ("sem pele"). Ausente em APIs anteriores. */
  notes?: string | null;
  substitutions: SubstitutionOption[];
}

export interface DietClientChoice {
  label: string | null;
  order: number;
  nutrition: NutritionRange | null;
  foods: DietClientFoodItem[];
}

export interface DietClientGroup {
  kind: MealGroupKind;
  label: string | null;
  order: number;
  nutrition: NutritionRange | null;
  choices: DietClientChoice[];
}

export interface DietClientMealNode {
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  nutrition: NutritionRange | null;
  groups: DietClientGroup[];
}

export interface DietClientDay {
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  order: number;
  nutrition: NutritionRange | null;
  meals: DietClientMealNode[];
}

export interface DietClientSupplement {
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string | null;
  timing: string | null;
  notes: string | null;
  order: number;
}

export interface DietClientSummary {
  dietId: string;
  versionId: string;
  meals: DietClientMeal[];
  /** Ausentes só se a API for anterior à estrutura nova — o app cai no formato antigo. */
  days?: DietClientDay[];
  supplements?: DietClientSupplement[];
  patientGuidelines?: string | null;
}

export interface WorkoutClientSet {
  order: number;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
}

export interface WorkoutClientExercise {
  workoutExerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  equipment: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  order: number;
  sets: WorkoutClientSet[];
}

export interface WorkoutClientDay {
  workoutDayId: string;
  name: string;
  order: number;
  exercises: WorkoutClientExercise[];
}

export interface WorkoutClientSummary {
  workoutId: string;
  versionId: string;
  days: WorkoutClientDay[];
}

export interface ExecutionSetInput {
  workoutExerciseId: string;
  setOrder: number;
  repsPerformed?: number;
  loadValue?: number;
  loadUnit?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  perceivedEffort?: number;
  notes?: string;
}

export interface CreateExecutionLogInput {
  workoutDayId: string;
  performedAt?: string;
  notes?: string;
  sets: ExecutionSetInput[];
}

export interface EvolutionMeasurements {
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

export interface EvolutionComposition {
  muscleMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  boneMassKg: number | null;
  basalMetabolicRateKcal: number | null;
  bodyAgeYears: number | null;
}

export type PhotoAngle = 'front' | 'side_right' | 'back' | 'side_left';

export interface EvaluationPhotoView {
  id: string;
  angle: PhotoAngle;
}

/**
 * Espelha PhysicalEvaluationClientSummaryDto (backend) — allowlist fechado
 * da Fase 8, Decisão 2 (+ fotos, adicionadas na fase de liberação para o
 * app). Nunca ganha um campo aqui sem o backend já expor, porque este tipo
 * é só o formato do que a API manda, não uma promessa própria do app.
 */
export interface EvolutionEntry {
  id: string;
  evaluatedAt: string;
  weightKg: number | null;
  bmi: number | null;
  bmiClassification: string | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  measurements: EvolutionMeasurements | null;
  composition: EvolutionComposition | null;
  photos: EvaluationPhotoView[];
}

/** Espelha ClientReportSummaryDto (backend) — só relatórios audience=client já liberados chegam aqui. */
export interface ClientReportSummary {
  id: string;
  evaluationEvaluatedAt: string;
  generatedAt: string;
  sizeBytes: number;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Fase 11 — Wearables e dispositivos
// ---------------------------------------------------------------------------

export type DeviceSourceType = 'ble_direct' | 'apple_healthkit' | 'android_health_connect' | 'manufacturer_api' | 'manual_import';
export type DeviceConnectionStatus = 'active' | 'revoked' | 'error';
export type DeviceMetricType =
  | 'heart_rate'
  | 'resting_heart_rate'
  | 'steps'
  | 'distance'
  | 'active_calories'
  | 'sleep_session'
  | 'workout_activity'
  | 'exercise_duration'
  | 'oxygen_saturation'
  | 'body_temperature'
  | 'respiratory_rate';

export interface DeviceConnection {
  id: string;
  sourceType: DeviceSourceType;
  driverId: string | null;
  deviceIdentifier: string | null;
  status: DeviceConnectionStatus;
  sharedWithProfessional: boolean;
  lastSyncedAt: string | null;
  connectedAt: string;
  revokedAt: string | null;
}

export interface DeviceConnectionsResponse {
  consentedAt: string | null;
  items: DeviceConnection[];
}

export interface MetricSampleInput {
  metricType: DeviceMetricType;
  value: number;
  unit: string;
  startedAt: string;
  endedAt: string;
  precision?: number;
  externalId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface IngestMetricsResult {
  inserted: number;
  duplicates: number;
  rejected: Array<{ index: number; reason: string }>;
}

export interface DeviceMetricSample {
  id: string;
  deviceConnectionId: string;
  metricType: DeviceMetricType;
  value: number;
  unit: string;
  startedAt: string;
  endedAt: string;
  precision: number | null;
}

// ---------------------------------------------------------------------------
// Fase 12 — IA assistiva (só o que o cliente pode pedir sobre o próprio dado)
// ---------------------------------------------------------------------------

export type ClientAiFeatureKey = 'explain_evaluation' | 'narrate_trend';

/** Sempre rotulado como conteúdo assistivo — nunca um dado original do sistema. */
export interface AiGenerationResult {
  feature: ClientAiFeatureKey;
  promptVersion: string;
  provider: string;
  model: string;
  text: string;
  generatedAt: string;
  isAiGenerated: true;
}

// ---------------------------------------------------------------------------
// Fase 16 — Notificações
// ---------------------------------------------------------------------------

export type NotificationEventType =
  | 'report_ready'
  | 'evaluation_released'
  | 'diet_published'
  | 'workout_published'
  | 'message_received'
  | 'appointment_reminder';

export interface NotificationPreference {
  eventType: NotificationEventType;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Fase 17 — Comunicação
// ---------------------------------------------------------------------------

export type MessageSenderRole = 'professional' | 'client';

export interface Message {
  id: string;
  threadId: string;
  senderRole: MessageSenderRole;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Fase 18 — Agenda e consultas
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Fase 19 — LGPD operacional
// ---------------------------------------------------------------------------

// Formato solto de propósito: é um bundle de vários domínios já tipados em
// outro lugar (perfil, avaliações, dieta, treino, relatórios, mensagens,
// consultas, dispositivos, preferências) — só serializado como texto para
// compartilhar via Share, nunca renderizado campo a campo na tela.
export interface ClientDataExport {
  requestId: string;
  exportedAt: string;
  [key: string]: unknown;
}

// --- Registros do próprio paciente (peso, água e fotos) -------------------------

export interface WeightEntry {
  /** null quando o peso veio de uma avaliação liberada (não pode ser apagado pelo app). */
  id: string | null;
  weightKg: number;
  recordedAt: string;
  source: 'self' | 'evaluation';
}

export interface WeightList {
  targetWeightKg: number | null;
  /** Ordem cronológica (mais antigo primeiro). */
  items: WeightEntry[];
}

export type WaterGoalSource = 'professional' | 'weight' | 'default';

export interface WaterEntry {
  id: string;
  amountMl: number;
  loggedAt: string;
}

export interface WaterDay {
  date: string;
  totalMl: number;
  goalMl: number;
  goalSource: WaterGoalSource;
  entries: WaterEntry[];
}

export interface WaterHistory {
  goalMl: number;
  goalSource: WaterGoalSource;
  days: Array<{ date: string; totalMl: number }>;
}

/** Autorização do paciente para o nutricionista ver as fotos de progresso. */
export interface PhotoSharing {
  shared: boolean;
  sharedAt: string | null;
}

export interface ProgressPhoto {
  id: string;
  contentType: string;
  takenAt: string;
  createdAt: string;
}

export interface WorkoutExecutionSetRecord {
  workoutExerciseId: string;
  setOrder: number;
  repsPerformed: number | null;
  loadValue: number | null;
  loadUnit: string | null;
}

export interface WorkoutExecutionRecord {
  id: string;
  workoutDayId: string;
  performedAt: string;
  notes: string | null;
  sets: WorkoutExecutionSetRecord[];
}
