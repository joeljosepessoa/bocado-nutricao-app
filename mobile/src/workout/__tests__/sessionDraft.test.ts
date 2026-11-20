const memory = new Map<string, string>();
jest.mock('../../offline/storage', () => ({
  asyncStorageStore: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memory.set(key, value);
    },
  },
}));

import { applyDraft, loadsSummary, toDraft, unmarkedEditedSets, type ExecutionExercise, type ExecutionSet } from '../executionModel';
import { clearWorkoutDraft, DRAFT_MAX_AGE_MS, readWorkoutDrafts, saveWorkoutDraft } from '../sessionDraftStore';

const set = (key: string, extra: Partial<ExecutionSet> = {}): ExecutionSet => ({
  key,
  workoutExerciseId: 'ex-1',
  setOrder: 0,
  number: 1,
  done: false,
  reps: '12',
  load: '20',
  loadUnit: 'kg',
  restSeconds: 60,
  repsTarget: '12',
  notes: null,
  ...extra,
});
const exercise = (sets: ExecutionSet[]): ExecutionExercise => ({
  workoutExerciseId: 'ex-1',
  name: 'Supino',
  muscleGroup: null,
  equipment: null,
  notes: null,
  instructions: null,
  imageUrl: null,
  sets,
  lastTime: null,
});

beforeEach(() => memory.clear());

describe('rascunho do treino em andamento', () => {
  it('o que foi marcado e digitado volta por cima da prescrição, série a série', () => {
    const typed = [exercise([set('a', { done: true, load: '32,5', loadEdited: true }), set('b', { load: '35', loadEdited: true })])];
    const draft = toDraft(typed, 'pesado hoje', true);
    const restored = applyDraft([exercise([set('a'), set('b'), set('c')])], draft);
    expect(restored[0].sets.map((s) => [s.key, s.done, s.load, !!s.loadEdited])).toEqual([
      ['a', true, '32,5', true],
      ['b', false, '35', true],
      ['c', false, '20', false],
    ]);
    expect(draft.notes).toBe('pesado hoje');
  });

  it('carga digitada em série não marcada é apontada (ela não seria salva); sugestão da última vez não', () => {
    const list = [exercise([set('a', { done: true, loadEdited: true }), set('b', { load: '35', loadEdited: true }), set('c'), set('d', { load: '', loadEdited: true })])];
    expect(unmarkedEditedSets(list).map((s) => s.key)).toEqual(['b']);
  });

  it('cargas diferentes por série aparecem juntas ("30 · 35")', () => {
    expect(loadsSummary([set('a', { load: '30' }), set('b', { load: '35' }), set('c', { load: '35' }), set('d', { load: '' })])).toBe('30 · 35');
  });

  it('fica no aparelho por paciente, some ao finalizar e vence depois de 18 h', async () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const draft = toDraft([exercise([set('a', { load: '40', loadEdited: true })])], '', true);
    await saveWorkoutDraft('user-1', 'v1:day-a', draft, now);
    await saveWorkoutDraft('user-1', 'v1:day-b', draft, now);
    expect(Object.keys(await readWorkoutDrafts('user-1', now + 1000))).toEqual(['v1:day-a', 'v1:day-b']);
    expect(await readWorkoutDrafts('user-2', now)).toEqual({});

    await clearWorkoutDraft('user-1', 'v1:day-a');
    expect(Object.keys(await readWorkoutDrafts('user-1', now))).toEqual(['v1:day-b']);
    expect(await readWorkoutDrafts('user-1', now + DRAFT_MAX_AGE_MS + 1)).toEqual({});
  });

  it('gravar um dia não estende a validade do outro', async () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const draft = toDraft([exercise([set('a')])], '', false);
    await saveWorkoutDraft('user-1', 'old', draft, now);
    await saveWorkoutDraft('user-1', 'new', draft, now + DRAFT_MAX_AGE_MS - 1000);
    expect(Object.keys(await readWorkoutDrafts('user-1', now + DRAFT_MAX_AGE_MS + 1))).toEqual(['new']);
  });
});
