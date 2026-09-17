export type Role = 'professional' | 'client';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface ClientListItem {
  id: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  user: { email: string; fullName: string };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EvaluationListItem {
  id: string;
  evaluatedAt: string;
  weightKg: number | null;
  createdAt: string;
  calculatedMetrics: {
    bmi: number | null;
    bodyFatPercent: number | null;
    bodyFatPercentSource: string | null;
  } | null;
}

export interface EvaluationDetail {
  id: string;
  evaluatedAt: string;
  heightCm: number;
  weightKg: number | null;
  releasedToClientAt: string | null;
  bioimpedance: { origin: 'manual' | 'device_confirmed' } | null;
}

/** Mesmo shape de Bioimpedance (backend) — o que um driver pode reportar. */
export interface NormalizedScaleReading {
  weightKg?: number;
  bodyFatPercent?: number;
  fatMassKg?: number;
  leanMassKg?: number;
  skeletalMuscleMassKg?: number;
  muscleMassKg?: number;
  bodyWaterPercent?: number;
  visceralFatLevel?: number;
  basalMetabolicRateKcal?: number;
  bodyAgeYears?: number;
  boneMassKg?: number;
  segmentalData?: Record<string, unknown>;
  impedanceData?: Record<string, unknown>;
}

export interface ConfirmScaleReadingInput {
  status: 'confirmed' | 'discarded';
  driverId: string;
  deviceIdentifier: string;
  protocolVersion: string;
  recordedAt: string;
  idempotencyKey: string;
  rawPayload: Record<string, unknown>;
  normalized?: NormalizedScaleReading;
}

export interface ScaleReadingSummary {
  id: string;
  evaluationId: string;
  status: 'confirmed' | 'discarded';
  driverId: string;
  deviceIdentifier: string;
  protocolVersion: string;
  normalized: NormalizedScaleReading;
  recordedAt: string;
  createdAt: string;
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
