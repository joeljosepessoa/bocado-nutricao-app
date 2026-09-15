/**
 * Subconjunto seguro de um treino para eventual exposição ao próprio
 * cliente — sem rota nesta fase (Fase 7). Existe agora só para provar,
 * com teste dedicado, que o backend já sabe montar uma visão sem dado
 * interno: nunca notas do profissional, nunca versão que não seja a
 * publicada.
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
  exerciseName!: string;
  order!: number;
  sets!: WorkoutClientSetDto[];
}

export class WorkoutClientDayDto {
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
      name: string;
      order: number;
      exercises: Array<{
        order: number;
        exercise: { name: string };
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
      dayDto.name = day.name;
      dayDto.order = day.order;
      dayDto.exercises = day.exercises.map((ex) => {
        const exDto = new WorkoutClientExerciseDto();
        exDto.exerciseName = ex.exercise.name;
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
