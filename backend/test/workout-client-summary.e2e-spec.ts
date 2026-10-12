import { WorkoutClientSummaryDto } from '../src/workouts/dto/workout-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — prova que o mapper só
// serializa a versão publicada: a prescrição inteira (com faixa de repetições
// e observações do dia/exercício/série), nunca o objetivo e as anotações
// gerais da versão, que são do profissional.
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
        notes: 'Aquecer 5 min na esteira antes',
        exercises: [
          {
            id: 'we-1',
            order: 0,
            notes: 'Drop-set na última série',
            exercise: {
              name: 'Supino reto',
              muscleGroup: 'peito',
              equipment: 'barra',
              instructions: 'Deite no banco, desça a barra até o peito e empurre.',
              description: 'Texto interno do catálogo',
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
                notes: null,
                repsMin: null,
                repsMax: null,
              },
              {
                order: 1,
                reps: null,
                repsMin: 8,
                repsMax: 12,
                loadValue: null,
                loadUnit: null,
                durationSeconds: null,
                distanceMeters: null,
                restSeconds: 90,
                tempo: null,
                notes: 'até a falha',
              },
            ],
          },
        ],
      },
    ],
  };

  it('expõe dias, exercícios (com id para execução) e séries prescritas, mas nunca objetivo e anotações gerais da versão', () => {
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(fullVersion as never)!;

    expect(dto.workoutId).toBe('workout-1');
    expect(dto.days[0].workoutDayId).toBe('day-1');
    expect(dto.days[0].name).toBe('Dia A');
    expect(dto.days[0].exercises[0].workoutExerciseId).toBe('we-1');
    expect(dto.days[0].exercises[0].exerciseName).toBe('Supino reto');
    expect(dto.days[0].exercises[0].sets[0]).toEqual({
      order: 0,
      reps: 12,
      repsMin: null,
      repsMax: null,
      loadValue: 40,
      loadUnit: 'kg',
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: 60,
      tempo: null,
      notes: null,
    });

    const keys = Object.keys(dto);
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('objective');
    expect(JSON.stringify(dto)).not.toMatch(/confidencial|plano interno|Texto interno do catálogo/);
  });

  it('a faixa de repetições ("8-12") chega ao aluno como faixa — nunca some nem vira um número', () => {
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(fullVersion as never)!;
    expect(dto.days[0].exercises[0].sets[1]).toMatchObject({ order: 1, reps: null, repsMin: 8, repsMax: 12, restSeconds: 90 });
  });

  it('observações do dia, do exercício (técnica) e da série, e o "como fazer" do catálogo, fazem parte do que o aluno vê', () => {
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(fullVersion as never)!;
    expect(dto.days[0].notes).toBe('Aquecer 5 min na esteira antes');
    expect(dto.days[0].exercises[0]).toMatchObject({
      notes: 'Drop-set na última série',
      instructions: 'Deite no banco, desça a barra até o peito e empurre.',
      equipment: 'barra',
    });
    expect(dto.days[0].exercises[0].sets[1].notes).toBe('até a falha');
  });

  it('treino antigo, sem esses campos carregados, continua sendo servido (campos novos ficam null)', () => {
    const legacy = {
      id: 'v-0',
      workoutId: 'workout-0',
      status: 'published',
      days: [{ id: 'd', name: 'Dia A', order: 0, exercises: [{ id: 'we', order: 0, exercise: { name: 'Remada', muscleGroup: null, equipment: null, videoUrl: null, imageUrl: null }, sets: [{ order: 0, reps: 10, loadValue: null, loadUnit: null, durationSeconds: null, distanceMeters: null, restSeconds: null, tempo: null }] }] }],
    };
    const dto = WorkoutClientSummaryDto.fromPublishedVersion(legacy)!;
    expect(dto.days[0]).toMatchObject({ notes: null });
    expect(dto.days[0].exercises[0]).toMatchObject({ notes: null, instructions: null });
    expect(dto.days[0].exercises[0].sets[0]).toMatchObject({ reps: 10, repsMin: null, repsMax: null, notes: null });
  });

  it('devolve null para versão não publicada (draft ou superseded)', () => {
    expect(WorkoutClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'draft' } as never)).toBeNull();
    expect(WorkoutClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'superseded' } as never)).toBeNull();
  });
});
