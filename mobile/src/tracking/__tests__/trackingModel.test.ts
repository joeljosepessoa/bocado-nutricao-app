import type { WeightEntry } from '../../types/api';
import {
  formatCalendarDay,
  executionView,
  formatDelta,
  parseWaterInput,
  parseWeightInput,
  totalWeightChange,
  waterBars,
  weightRows,
} from '../trackingModel';

const entry = (id: string, kg: number, iso: string): WeightEntry => ({ id, weightKg: kg, recordedAt: iso, source: 'self' });

describe('entrada de peso e água', () => {
  it('aceita vírgula ou ponto e recusa valores fora da faixa', () => {
    expect(parseWeightInput('72,4')).toBe(72.4);
    expect(parseWeightInput(' 80.25 ')).toBe(80.25);
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('15')).toBeNull();
    expect(parseWeightInput('72,456')).toBeNull();
    expect(parseWeightInput('abc')).toBeNull();
  });

  it('água em ml inteiros de 10 a 3000', () => {
    expect(parseWaterInput('300')).toBe(300);
    expect(parseWaterInput('5')).toBeNull();
    expect(parseWaterInput('3500')).toBeNull();
    expect(parseWaterInput('2,5')).toBeNull();
  });
});

describe('histórico de peso', () => {
  const items = [
    entry('b', 79.2, '2026-10-05T10:00:00.000Z'),
    entry('a', 80, '2026-10-01T10:00:00.000Z'),
    entry('c', 78.4, '2026-10-08T10:00:00.000Z'),
  ];

  it('lista do mais recente ao mais antigo, com a variação para o anterior', () => {
    const rows = weightRows(items);
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(rows[0].delta).toBeCloseTo(-0.8);
    expect(rows[2].delta).toBeNull();
  });

  it('variação total só com 2+ registros', () => {
    expect(totalWeightChange(items)).toBeCloseTo(-1.6);
    expect(totalWeightChange([items[0]])).toBeNull();
  });

  it('formata variação e dia', () => {
    expect(formatDelta(-0.84)).toBe('-0,8 kg');
    expect(formatDelta(1.25)).toBe('+1,3 kg');
    expect(formatDelta(0.01)).toBe('0 kg');
    expect(formatCalendarDay('2026-10-08')).toBe('08/10/2026');
  });
});

describe('barras de água', () => {
  it('últimos 7 dias com hoje por último; dia sem registro = 0 ml', () => {
    const bars = waterBars(
      { goalMl: 2000, goalSource: 'default', days: [{ date: '2026-10-08', totalMl: 1000 }, { date: '2026-10-06', totalMl: 2600 }] },
      new Date(2026, 9, 8, 9, 0),
    );
    expect(bars).toHaveLength(7);
    expect(bars[6]).toMatchObject({ date: '2026-10-08', weekday: 'Qui', totalMl: 1000, percent: 0.5 });
    expect(bars[4]).toMatchObject({ date: '2026-10-06', totalMl: 2600, percent: 1 });
    expect(bars[5]).toMatchObject({ date: '2026-10-07', totalMl: 0, percent: 0 });
  });
});

describe('histórico de treinos', () => {
  it('usa os nomes do treino atual e agrupa as séries por exercício', () => {
    const view = executionView(
      {
        id: 'x',
        workoutDayId: 'd1',
        performedAt: '2026-10-08T12:00:00.000Z',
        notes: '  Joelho ok  ',
        sets: [
          { workoutExerciseId: 'e1', setOrder: 2, repsPerformed: 10, loadValue: 22.5, loadUnit: 'kg' },
          { workoutExerciseId: 'e1', setOrder: 1, repsPerformed: 12, loadValue: 20, loadUnit: 'kg' },
          { workoutExerciseId: 'old', setOrder: 1, repsPerformed: null, loadValue: null, loadUnit: null },
        ],
      },
      {
        workoutId: 'w',
        versionId: 'v',
        days: [{ workoutDayId: 'd1', name: 'Treino A', order: 1, exercises: [{ workoutExerciseId: 'e1', exerciseName: 'Agachamento' } as never] }],
      },
    );
    expect(view).toMatchObject({ dayName: 'Treino A', notes: 'Joelho ok', setCount: 3 });
    expect(view.exercises).toEqual([
      { name: 'Agachamento', sets: ['12 reps · 20 kg', '10 reps · 22,5 kg'] },
      { name: 'Exercício', sets: ['série feita'] },
    ]);
  });
});
