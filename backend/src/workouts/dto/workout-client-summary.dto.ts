/**
 * Subconjunto seguro de um treino para exposição ao próprio cliente
 * (Fase 7). Nunca notas do profissional, nunca versão que não seja a
 * publicada. Inclui `workoutDayId`/`workoutExerciseId` — não são dado
 * técnico, são as referências que o próprio app precisa para registrar
 * a execução (Seção 6 do desenho) apontando para o item certo.
 */
export class WorkoutClientSetDto {
  order!: number;
  reps!: number | null;
  loadValue!: number | null;
  loadUnit!: string | null;
  durationSeconds!: number | null;
  distanceMeters!: number | null;
  restSeconds!: number | null;
  tempo!: string | null;
}

export class WorkoutClientExerciseDto {
  workoutExerciseId!: string;
  exerciseName!: string;
  muscleGroup!: string | null;
  equipment!: string | null;
  videoUrl!: string | null;
  imageUrl!: string | null;
  order!: number;
  sets!: WorkoutClientSetDto[];
}

export class WorkoutClientDayDto {
  workoutDayId!: string;
  name!: string;
  order!: number;
  exercises!: WorkoutClientExerciseDto[];
}

export class WorkoutClientSummaryDto {
  workoutId!: string;
  versionId!: string;
  days!: WorkoutClientDayDto[];

  static fromPublishedVersion(version: {
    id: string;
    workoutId: string;
    status: string;
    days: Array<{
      id: string;
      name: string;
      order: number;
      exercises: Array<{
        id: string;
        order: number;
        exercise: { name: string; muscleGroup: string | null; equipment: string | null; videoUrl: string | null; imageUrl: string | null };
        sets: Array<{
          order: number;
          reps: number | null;
          loadValue: number | null;
          loadUnit: string | null;
          durationSeconds: number | null;
          distanceMeters: number | null;
          restSeconds: number | null;
          tempo: string | null;
        }>;
      }>;
    }>;
  }): WorkoutClientSummaryDto | null {
    if (version.status !== 'published') {
      return null;
    }
    const dto = new WorkoutClientSummaryDto();
    dto.workoutId = version.workoutId;
    dto.versionId = version.id;
    dto.days = version.days.map((day) => {
      const dayDto = new WorkoutClientDayDto();
      dayDto.workoutDayId = day.id;
      dayDto.name = day.name;
      dayDto.order = day.order;
      dayDto.exercises = day.exercises.map((ex) => {
        const exDto = new WorkoutClientExerciseDto();
        exDto.workoutExerciseId = ex.id;
        exDto.exerciseName = ex.exercise.name;
        exDto.muscleGroup = ex.exercise.muscleGroup;
        exDto.equipment = ex.exercise.equipment;
        exDto.videoUrl = ex.exercise.videoUrl;
        exDto.imageUrl = ex.exercise.imageUrl;
        exDto.order = ex.order;
        exDto.sets = ex.sets.map((s) => {
          const setDto = new WorkoutClientSetDto();
          setDto.order = s.order;
          setDto.reps = s.reps;
          setDto.loadValue = s.loadValue;
          setDto.loadUnit = s.loadUnit;
          setDto.durationSeconds = s.durationSeconds;
          setDto.distanceMeters = s.distanceMeters;
          setDto.restSeconds = s.restSeconds;
          setDto.tempo = s.tempo;
          return setDto;
        });
        return exDto;
      });
      return dayDto;
    });
    return dto;
  }
}
