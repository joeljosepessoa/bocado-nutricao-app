import { WorkoutClientSummaryDto } from '../src/workouts/dto/workout-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — prova que o mapper só
// serializa dado da versão publicada e nunca campo interno do profissional.
describe('WorkoutClientSummaryDto', () => {
  const fullVersion = {
    id: 'v-1',
    workoutId: 'workout-1',
    status: 'published',
    notes: 'Nota clínica confidencial',
    objective: 'Hipertrofia — plano interno',
    days: [
      {
        id: 'day-1',
        name: 'Dia A',
        order: 0,
        notes: 'Observação interna do profissional',
        exercises: [
          {
            id: 'we-1',
            order: 0,
            exercise: {
              name: 'Supino reto',
              muscleGroup: 'peito',
              equipment: 'barra',
              videoUrl: null,
              imageUrl: null,
            },
            sets: [
              {
                order: 0,
                reps: 12,
                loadValue: 40,
                loadUnit: 'kg',
                durationSeconds: null,
                distanceMeters: null,
                restSeconds: 60,
                tempo: null,
              },
            ],
          },
        ],
      },
    ],
  };

  it('expõe dias, exercícios (com id para execução) e séries prescritas, mas nunca notas internas', () => {
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(fullVersion as never)!;

    expect(dto.workoutId).toBe('workout-1');
    expect(dto.days[0].workoutDayId).toBe('day-1');
    expect(dto.days[0].name).toBe('Dia A');
    expect(dto.days[0].exercises[0].workoutExerciseId).toBe('we-1');
    expect(dto.days[0].exercises[0].exerciseName).toBe('Supino reto');
    expect(dto.days[0].exercises[0].sets[0]).toEqual({
      order: 0,
      reps: 12,
      loadValue: 40,
      loadUnit: 'kg',
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: 60,
      tempo: null,
    });

    const keys = Object.keys(dto);
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('objective');
    expect((dto.days[0] as unknown as Record<string, unknown>).notes).toBeUndefined();
  });

  it('devolve null para versão não publicada (draft ou superseded)', () => {
    expect(WorkoutClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'draft' } as never)).toBeNull();
    expect(WorkoutClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'superseded' } as never)).toBeNull();
  });
});
