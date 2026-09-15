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

export interface EvolutionEntry {
  id: string;
  evaluatedAt: string;
  weightKg: number | null;
  bmiClassification: string | null;
  bodyFatPercent: number | null;
  leanMassKg: number | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
