import type { WeightEntry, WorkoutClientSummary } from '../../types/api';
import type { DayView, MealView } from '../../diet/dietPresentation';
import {
  dailyGoals,
  dietDayIndex,
  formatMl,
  hasTrainingAndRest,
  latestWeight,
  localDateKey,
  nextMeal,
  nextWorkoutDay,
  parseMealTime,
  waterProgress,
  weightChartPoints,
  weightGoalText,
} from '../dashboardModel';

const NOW = new Date(2026, 9, 8, 10, 0); // 08/10/2026 10:00 no fuso do aparelho
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const weight = (n: number, kg: number): WeightEntry => ({ id: `w${n}`, weightKg: kg, recordedAt: daysAgo(n), source: 'self' });

describe('peso', () => {
  it('gráfico: um ponto por registro real, só dos últimos 30 dias, em ordem', () => {
    const points = weightChartPoints([weight(2, 78), weight(45, 82), weight(10, 79.5), weight(0, 77.8)], NOW);
    expect(points.map((p) => p.value)).toEqual([79.5, 78, 77.8]);
  });

  it('gráfico sem registros fica vazio (a tela mostra o convite para registrar)', () => {
    expect(weightChartPoints([], NOW)).toEqual([]);
    expect(weightChartPoints([weight(1, 70)], NOW)).toHaveLength(1);
  });

  it('peso atual é o registro mais recente; sem registro, null', () => {
    expect(latestWeight([weight(5, 80), weight(1, 79), weight(3, 79.5)])?.weightKg).toBe(79);
    expect(latestWeight([])).toBeNull();
  });

  it('meta de peso só da ficha; sem meta, "--" (nunca calculada)', () => {
    expect(weightGoalText(68.5)).toBe('68,5 kg');
    expect(weightGoalText(null)).toBe('--');
    expect(weightGoalText(undefined)).toBe('--');
  });
});

describe('dieta do dia', () => {
  const days = [{ kind: 'training' as const }, { kind: 'rest' as const }];

  it('escolhe o dia do tipo indicado pelo paciente', () => {
    expect(dietDayIndex(days, 'rest')).toBe(1);
    expect(dietDayIndex(days, 'training')).toBe(0);
  });

  it('dieta sem esse tipo usa o primeiro dia; sem dias, -1', () => {
    expect(dietDayIndex([{ kind: 'other' }], 'rest')).toBe(0);
    expect(dietDayIndex([], 'rest')).toBe(-1);
  });

  it('seletor só com dia de treino e de descanso', () => {
    expect(hasTrainingAndRest(days)).toBe(true);
    expect(hasTrainingAndRest([{ kind: 'other' }, { kind: 'rest' }])).toBe(false);
  });

  it('metas diárias vêm do dia da dieta; sem cálculo, kcal null (nunca um valor fixo)', () => {
    const meal = { name: 'Almoço', time: '12:00' } as MealView;
    const day = (status: 'calculated' | 'unavailable', text: string | null) =>
      ({ calories: { status, text, macros: null }, meals: [meal, meal, meal] }) as unknown as DayView;
    expect(dailyGoals(day('calculated', '1.850 kcal'))).toEqual({ kcalText: '1.850 kcal', mealCount: 3 });
    expect(dailyGoals(day('unavailable', null))).toEqual({ kcalText: null, mealCount: 3 });
    expect(dailyGoals(null)).toBeNull();
  });
});

describe('próxima refeição', () => {
  const meal = (name: string, time: string | null) => ({ name, time }) as MealView;

  it('lê horários comuns', () => {
    expect(parseMealTime('7:30')).toBe(450);
    expect(parseMealTime('07h30')).toBe(450);
    expect(parseMealTime('12h')).toBe(720);
    expect(parseMealTime('Lanche')).toBeNull();
    expect(parseMealTime(null)).toBeNull();
  });

  it('é a primeira refeição com horário ainda por vir', () => {
    const meals = [meal('Café', '07:00'), meal('Lanche', '10:30'), meal('Almoço', '12:30')];
    expect(nextMeal(meals, NOW)).toEqual({ name: 'Lanche', time: '10:30' });
  });

  it('sem horários ou depois da última refeição, some (null)', () => {
    expect(nextMeal([meal('Café', null), meal('Almoço', null)], NOW)).toBeNull();
    expect(nextMeal([meal('Café', '07:00')], NOW)).toBeNull();
  });
});

describe('água e treino', () => {
  it('progresso da água limita a 100% e calcula o restante', () => {
    const base = { date: '2026-10-08', goalSource: 'weight' as const, entries: [] };
    expect(waterProgress({ ...base, totalMl: 500, goalMl: 2000 })).toEqual({ percent: 0.25, remainingMl: 1500 });
    expect(waterProgress({ ...base, totalMl: 2600, goalMl: 2000 })).toEqual({ percent: 1, remainingMl: 0 });
    expect(waterProgress(null)).toBeNull();
    expect(formatMl(2450)).toBe('2,45 L');
    expect(formatMl(250)).toBe('250 ml');
  });

  it('próximo treino: dia seguinte ao último concluído, em ciclo', () => {
    const workout = {
      workoutId: 'w',
      versionId: 'v',
      days: [
        { workoutDayId: 'b', name: 'Treino B', order: 2, exercises: [] },
        { workoutDayId: 'a', name: 'Treino A', order: 1, exercises: [] },
      ],
    } as WorkoutClientSummary;
    expect(nextWorkoutDay(workout, null)?.name).toBe('Treino A');
    expect(nextWorkoutDay(workout, 'a')?.name).toBe('Treino B');
    expect(nextWorkoutDay(workout, 'b')?.name).toBe('Treino A');
    expect(nextWorkoutDay(null, null)).toBeNull();
  });

  it('data do aparelho no formato AAAA-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
