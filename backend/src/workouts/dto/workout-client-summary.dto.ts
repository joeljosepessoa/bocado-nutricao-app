/**
 * Subconjunto seguro de um treino para exposição ao próprio cliente
 * (Fase 7): só a versão publicada. Vai a PRESCRIÇÃO inteira — inclusive a
 * faixa de repetições e as observações do dia, do exercício (técnica) e da
 * série, que o aluno precisa para executar. Nunca vão o objetivo e as
 * anotações gerais da versão (`WorkoutVersion.objective`/`notes`), que são
 * do profissional. Inclui `workoutDayId`/`workoutExerciseId` — não são dado
 * técnico, são as referências que o próprio app precisa para registrar
 * a execução (Seção 6 do desenho) apontando para o item certo.
 */
export class WorkoutClientSetDto {
  order!: number;
  /** Repetições exatas ("12"); null quando a prescrição é uma faixa. */
  reps!: number | null;
  /** Faixa ("8-12"): mínimo e máximo, sempre juntos; null na prescrição exata. */
  repsMin!: number | null;
  repsMax!: number | null;
  loadValue!: number | null;
  loadUnit!: string | null;
  durationSeconds!: number | null;
  distanceMeters!: number | null;
  restSeconds!: number | null;
  tempo!: string | null;
  notes!: string | null;
}

/** O que o aluno fez neste exercício da última vez (qualquer versão do treino), para o app já preencher a carga. */
export class WorkoutClientLastPerformanceDto {
  performedAt!: Date;
  sets!: Array<{ setOrder: number; repsPerformed: number | null; loadValue: number | null; loadUnit: string | null }>;
}

export class WorkoutClientExerciseDto {
  workoutExerciseId!: string;
  exerciseName!: string;
  muscleGroup!: string | null;
  equipment!: string | null;
  /** Como executar, do cadastro do exercício — o que orienta o aluno quando não há GIF. */
  instructions!: string | null;
  /** Observação/técnica prescrita para este exercício neste treino ("drop-set na última"). */
  notes!: string | null;
  videoUrl!: string | null;
  imageUrl!: string | null;
  order!: number;
  sets!: WorkoutClientSetDto[];
  /** Última execução deste exercício pelo próprio aluno; null se ainda não fez. */
  lastPerformance!: WorkoutClientLastPerformanceDto | null;
}

export class WorkoutClientDayDto {
  workoutDayId!: string;
  name!: string;
  notes!: string | null;
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
      notes?: string | null;
      order: number;
      exercises: Array<{
        id: string;
        order: number;
        notes?: string | null;
        exercise: {
          name: string;
          muscleGroup: string | null;
          equipment: string | null;
          instructions?: string | null;
          videoUrl: string | null;
          imageUrl: string | null;
        };
        sets: Array<{
          order: number;
          reps: number | null;
          repsMin?: number | null;
          repsMax?: number | null;
          loadValue: number | null;
          loadUnit: string | null;
          durationSeconds: number | null;
          distanceMeters: number | null;
          restSeconds: number | null;
          tempo: string | null;
          notes?: string | null;
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
      dayDto.notes = day.notes ?? null;
      dayDto.order = day.order;
      dayDto.exercises = day.exercises.map((ex) => {
        const exDto = new WorkoutClientExerciseDto();
        exDto.workoutExerciseId = ex.id;
        exDto.exerciseName = ex.exercise.name;
        exDto.muscleGroup = ex.exercise.muscleGroup;
        exDto.equipment = ex.exercise.equipment;
        exDto.instructions = ex.exercise.instructions ?? null;
        exDto.notes = ex.notes ?? null;
        exDto.videoUrl = ex.exercise.videoUrl;
        exDto.imageUrl = ex.exercise.imageUrl;
        exDto.order = ex.order;
        exDto.lastPerformance = null;
        exDto.sets = ex.sets.map((s) => {
          const setDto = new WorkoutClientSetDto();
          setDto.order = s.order;
          setDto.reps = s.reps;
          setDto.repsMin = s.repsMin ?? null;
          setDto.repsMax = s.repsMax ?? null;
          setDto.loadValue = s.loadValue;
          setDto.loadUnit = s.loadUnit;
          setDto.durationSeconds = s.durationSeconds;
          setDto.distanceMeters = s.distanceMeters;
          setDto.restSeconds = s.restSeconds;
          setDto.tempo = s.tempo;
          setDto.notes = s.notes ?? null;
          return setDto;
        });
        return exDto;
      });
      return dayDto;
    });
    return dto;
  }
}
