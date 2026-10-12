import type { WorkoutClientDay } from '../../types/api';
import {
  buildExecution,
  buildExecutionPayload,
  commonLoad,
  dayTabLabel,
  executionProgress,
  exerciseSummary,
  parseDecimal,
  prescriptionSummary,
  prescriptionText,
  restLabel,
  repsText,
} from '../executionModel';

const set = (order: number, extra: Record<string, unknown> = {}) => ({
  order,
  reps: 12,
  loadValue: 20,
  loadUnit: 'kg',
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: 90,
  tempo: null,
  ...extra,
});

const day: WorkoutClientDay = {
  workoutDayId: 'day-a',
  name: 'Treino A',
  order: 1,
  exercises: [
    {
      workoutExerciseId: 'ex-2',
      exerciseName: 'Remada',
      muscleGroup: 'Costas',
      equipment: null,
      videoUrl: null,
      imageUrl: null,
      order: 2,
      sets: [set(1, { loadValue: null, loadUnit: null, restSeconds: null })],
    },
    {
      workoutExerciseId: 'ex-1',
      exerciseName: 'Agachamento',
      muscleGroup: 'Pernas',
      equipment: null,
      videoUrl: null,
      imageUrl: null,
      order: 1,
      sets: [set(2, { loadValue: 22.5 }), set(1)],
    },
  ],
};

describe('execução do treino', () => {
  it('monta exercícios e séries na ordem da prescrição, numeradas a partir de 1', () => {
    const exercises = buildExecution(day);
    expect(exercises.map((e) => e.name)).toEqual(['Agachamento', 'Remada']);
    expect(exercises[0].sets.map((s) => [s.number, s.setOrder, s.load])).toEqual([
      [1, 1, '20'],
      [2, 2, '22,5'],
    ]);
    expect(exercises[1].sets[0].restSeconds).toBe(60);
  });

  it('salva só as séries feitas, com repetições, cargas (vírgula aceita), observação e data', () => {
    const exercises = buildExecution(day);
    exercises[0].sets[0] = { ...exercises[0].sets[0], done: true, reps: '10', load: '25,5' };
    exercises[1].sets[0] = { ...exercises[1].sets[0], done: true, reps: '15', load: '' };
    const payload = buildExecutionPayload('day-a', exercises, '  Senti o joelho na última série  ', new Date('2026-10-08T13:00:00.000Z'));
    expect(payload).toEqual({
      workoutDayId: 'day-a',
      performedAt: '2026-10-08T13:00:00.000Z',
      notes: 'Senti o joelho na última série',
      sets: [
        { workoutExerciseId: 'ex-1', setOrder: 1, repsPerformed: 10, loadValue: 25.5, loadUnit: 'kg' },
        { workoutExerciseId: 'ex-2', setOrder: 1, repsPerformed: 15, loadValue: undefined, loadUnit: undefined },
      ],
    });
  });

  it('sem séries feitas não há o que salvar; observação vazia não é enviada', () => {
    expect(buildExecutionPayload('day-a', buildExecution(day), 'nota', new Date())).toBeNull();
    const exercises = buildExecution(day);
    exercises[0].sets[0].done = true;
    expect(buildExecutionPayload('day-a', exercises, '   ', new Date())).not.toHaveProperty('notes');
  });

  it('progresso e textos da prescrição', () => {
    const exercises = buildExecution(day);
    exercises[0].sets[1].done = true;
    expect(executionProgress(exercises)).toEqual({ done: 1, total: 3, percent: 1 / 3 });
    expect(prescriptionText(set(1))).toBe('12 reps · 20 kg · descanso 90s');
    expect(exerciseSummary([set(1), set(2)])).toBe('2 séries · 12 reps');
    expect(parseDecimal('abc')).toBeUndefined();
  });
});

describe('faixa de repetições, observações e "como fazer" que o profissional prescreveu', () => {
  const range = set(1, { reps: null, repsMin: 8, repsMax: 12, loadValue: null, loadUnit: null });

  it('faixa aparece como faixa ("8–12") — nunca some nem vira um número só', () => {
    expect(repsText(range)).toBe('8–12');
    expect(repsText(set(1))).toBe('12');
    expect(repsText(set(1, { reps: null }))).toBeNull();
    expect(prescriptionText(range)).toBe('8–12 reps · descanso 90s');
    expect(exerciseSummary([range, range, set(3, { reps: 15 })])).toBe('3 séries · 8–12 / 15 reps');
  });

  it('na execução, a faixa é só a dica do campo: o aluno digita o que fez', () => {
    const [exercise] = buildExecution({ ...day, exercises: [{ ...day.exercises[0], sets: [range, set(2)] }] });
    expect(exercise.sets.map((s) => [s.reps, s.repsTarget])).toEqual([
      ['', '8–12'],
      ['12', '12'],
    ]);
    // Série em faixa marcada sem digitar nada não inventa repetições.
    exercise.sets[0].done = true;
    expect(buildExecutionPayload('day-a', [exercise], '', new Date())?.sets[0].repsPerformed).toBeUndefined();
  });

  it('observação/técnica, equipamento e instruções acompanham o exercício; texto vazio vira null', () => {
    const [exercise] = buildExecution({
      ...day,
      exercises: [
        {
          ...day.exercises[0],
          equipment: 'Barra',
          notes: ' Drop-set na última série ',
          instructions: 'Puxe a barra até o abdômen.',
          sets: [set(1, { notes: 'até a falha' }), set(2, { notes: '  ' })],
        },
      ],
    });
    expect(exercise).toMatchObject({ equipment: 'Barra', notes: 'Drop-set na última série', instructions: 'Puxe a barra até o abdômen.' });
    expect(exercise.sets.map((s) => s.notes)).toEqual(['até a falha', null]);
  });

  it('servidor antigo, que ainda não envia esses campos, não quebra a tela', () => {
    const [exercise] = buildExecution(day);
    expect(exercise).toMatchObject({ notes: null, instructions: null, equipment: null });
    expect(exercise.sets[0]).toMatchObject({ repsTarget: '12', notes: null });
  });
});

describe('layout de Meus Treinos: botões de dia, resumo "4x 6–8" e carga única', () => {
  it('rótulo do dia: dia da semana abreviado, nome curto como está e "Dia N" para nome longo', () => {
    expect(dayTabLabel('SEGUNDA - PEITO + TRÍCEPS', 0)).toBe('Seg');
    expect(dayTabLabel('Terça-feira', 1)).toBe('Ter');
    expect(dayTabLabel('Sábado: pernas', 5)).toBe('Sáb');
    expect(dayTabLabel('Treino A', 0)).toBe('Treino A');
    expect(dayTabLabel('Treino B — Costas e bíceps', 1)).toBe('Treino B');
    expect(dayTabLabel('Dia 1', 0)).toBe('Dia 1');
    expect(dayTabLabel('GLÚTEO E POSTERIOR', 0)).toBe('Dia 1');
    expect(dayTabLabel('', 2)).toBe('Dia 3');
  });

  it('resumo do exercício: "4x" + repetições (ou faixa); séries diferentes aparecem todas; sem repetições, só a contagem', () => {
    const range = set(1, { reps: null, repsMin: 6, repsMax: 8 });
    const sets = (items: ReturnType<typeof set>[]) => buildExecution({ ...day, exercises: [{ ...day.exercises[0], sets: items }] })[0].sets;
    expect(prescriptionSummary(sets([range, { ...range, order: 2 }, { ...range, order: 3 }, { ...range, order: 4 }]))).toEqual({ count: '4x', reps: '6–8' });
    expect(prescriptionSummary(sets([set(1), set(2, { reps: 10 }), set(3, { reps: 8 })]))).toEqual({ count: '3x', reps: '12 / 10 / 8' });
    expect(prescriptionSummary(sets([set(1, { reps: null })]))).toEqual({ count: '1x', reps: null });
    expect(restLabel(90)).toBe('90 segundos');
    expect(restLabel(1)).toBe('1 segundo');
  });

  it('carga única: mostra o valor quando todas as séries têm a mesma; em branco quando diferem', () => {
    const [exercise] = buildExecution(day).filter((e) => e.name === 'Agachamento');
    // Prescrição com 20 kg numa série e 22,5 kg na outra: o campo único fica em branco.
    expect(commonLoad(exercise.sets)).toBe('');
    expect(commonLoad(exercise.sets.map((s) => ({ ...s, load: '30' })))).toBe('30');
    expect(commonLoad(buildExecution(day).find((e) => e.name === 'Remada')!.sets)).toBe('');
  });
});
