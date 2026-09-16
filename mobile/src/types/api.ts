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

export interface DietClientMealFood {
  foodName: string;
  quantity: number;
  unit: string;
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

export interface DietClientSummary {
  dietId: string;
  versionId: string;
  meals: DietClientMeal[];
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

/**
 * Espelha PhysicalEvaluationClientSummaryDto (backend) — allowlist fechado
 * da Fase 8, Decisão 2. Nunca ganha um campo aqui sem o backend já expor,
 * porque este tipo é só o formato do que a API manda, não uma promessa
 * própria do app.
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
