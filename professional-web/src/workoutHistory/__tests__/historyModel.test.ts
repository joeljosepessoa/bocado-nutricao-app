import { describe, expect, it } from 'vitest';
import type { WorkoutHistorySession, WorkoutHistorySet } from '../../types/api';
import { daysAgoText, exerciseProgress, progressText, sessionsInLast, setText } from '../historyModel';

const set = (over: Partial<WorkoutHistorySet> = {}): WorkoutHistorySet => ({
  setOrder: 0,
  reps: 12,
  loadValue: 20,
  loadUnit: 'kg',
  durationSeconds: null,
  distanceMeters: null,
  perceivedEffort: null,
  ...over,
});
const session = (performedAt: string, exercises: WorkoutHistorySession['exercises']): WorkoutHistorySession => ({
  id: performedAt,
  performedAt,
  dayName: 'Treino A',
  versionNumber: 1,
  loggedBy: 'client',
  notes: null,
  exercises,
});

describe('histórico de treino', () => {
  it('escreve cada série como o paciente fez', () => {
    expect(setText(set({ reps: 10, loadValue: 27.5 }))).toBe('10 × 27,5 kg');
    expect(setText(set({ loadValue: null, loadUnit: null }))).toBe('12 reps');
    expect(setText(set({ reps: 15, loadValue: null, loadUnit: 'bodyweight' }))).toBe('15 × peso corporal');
    expect(setText(set({ reps: null, loadValue: null, loadUnit: null, durationSeconds: 45 }))).toBe('45s');
    expect(setText(set({ reps: null, loadValue: null, loadUnit: null, distanceMeters: 1200 }))).toBe('1,2 km');
  });

  it('frequência e "há N dias"', () => {
    const now = new Date('2026-10-28T12:00:00');
    const sessions = [session('2026-10-27T20:00:00', []), session('2026-10-10T20:00:00', []), session('2026-09-01T20:00:00', [])];
    expect(sessionsInLast(sessions, 28, now)).toBe(2);
    expect(daysAgoText('2026-10-28T08:00:00', now)).toBe('hoje');
    expect(daysAgoText('2026-10-27T23:00:00', now)).toBe('ontem');
    expect(daysAgoText('2026-10-25T10:00:00', now)).toBe('há 3 dias');
  });

  it('evolução: maior carga de cada sessão, da primeira à última; exercício sem carga fica de fora', () => {
    const sessions = [
      session('2026-10-27T20:00:00', [
        { exerciseId: 'sq', name: 'Agachamento sumô', sets: [set({ loadValue: 25 }), set({ setOrder: 1, reps: 10, loadValue: 27.5 })] },
        { exerciseId: 'pl', name: 'Prancha', sets: [set({ reps: null, loadValue: null, loadUnit: null, durationSeconds: 40 })] },
      ]),
      session('2026-10-20T20:00:00', [{ exerciseId: 'sq', name: 'Agachamento sumô', sets: [set({ loadValue: 20 })] }]),
      session('2026-10-13T20:00:00', [{ exerciseId: 'mf', name: 'Mesa flexora', sets: [set({ loadValue: 30 })] }]),
    ];
    const progress = exerciseProgress(sessions);
    expect(progress.map((p) => p.name)).toEqual(['Agachamento sumô', 'Mesa flexora']);
    expect(progress[0].points.map((p) => p.load)).toEqual([20, 27.5]);
    expect(progressText(progress[0])).toBe('20 kg → 27,5 kg (+7,5 kg)');
    expect(progressText(progress[1])).toBe('30 kg');
  });
});
