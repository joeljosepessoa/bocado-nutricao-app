import { describe, expect, it } from 'vitest';
import type { OrganizedWorkoutProposal, ProposalSet } from '../../types/api';
import {
  dayWarnings,
  draftProblems,
  draftToPayload,
  exerciseWarnings,
  LIVE_WARNINGS,
  manualExercise,
  moveExercise,
  proposalToDraft,
  removeExercise,
  selectExercise,
  setRepsMode,
  updateExercise,
} from '../draft';

const set = (overrides: Partial<ProposalSet> = {}): ProposalSet => ({
  reps: null,
  repsMin: null,
  repsMax: null,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  notes: null,
  ...overrides,
});

const supino = { id: 'ex-supino', name: 'Supino reto com barra', muscleGroup: 'Peito', equipment: 'Barra', imageUrl: '/exercise-media/abc' };
const remadaA = { id: 'ex-remada-a', name: 'Remada curvada', muscleGroup: 'Costas', equipment: 'Barra', imageUrl: null };
const remadaB = { id: 'ex-remada-b', name: 'Remada curvada', muscleGroup: 'Dorsal', equipment: 'Halteres', imageUrl: null };

const proposal: OrganizedWorkoutProposal = {
  warnings: ['Texto final não reconhecido: "obs geral"'],
  days: [
    {
      name: 'SEGUNDA - PEITO',
      notes: null,
      warnings: [],
      exercises: [
        {
          rawName: 'Supino reto com barra',
          muscleGroupHint: 'Peito',
          notes: null,
          matchStatus: 'matched',
          matchedExercise: supino,
          candidates: [],
          sets: [set({ repsMin: 6, repsMax: 10, restSeconds: 90 }), set({ repsMin: 6, repsMax: 10, restSeconds: 90 })],
          warnings: ['Repetições apresentadas como intervalo.'],
        },
        {
          rawName: 'Remada curvada',
          muscleGroupHint: null,
          notes: 'drop-set',
          matchStatus: 'ambiguous',
          matchedExercise: null,
          candidates: [remadaA, remadaB],
          sets: [set({ reps: 12 })],
          warnings: ['Nome do exercício possui mais de uma correspondência possível.', 'Descanso não informado.', '"até a falha" não mapeado'],
        },
      ],
    },
  ],
};

describe('proposalToDraft', () => {
  it('preserva faixa e exata como vieram, e separa avisos "vivos" das observações da IA', () => {
    const draft = proposalToDraft(proposal);
    const [supinoEx, remadaEx] = draft.days[0].exercises;

    expect(supinoEx.sets.map((s) => [s.repsMode, s.reps, s.repsMin, s.repsMax])).toEqual([
      ['range', null, 6, 10],
      ['range', null, 6, 10],
    ]);
    expect(supinoEx.notices).toEqual(['Repetições apresentadas como intervalo.']);
    expect(remadaEx.sets[0]).toMatchObject({ repsMode: 'exact', reps: 12 });
    expect(remadaEx.notices).toEqual(['"até a falha" não mapeado']);
    expect(draft.notices).toEqual(['Texto final não reconhecido: "obs geral"']);
  });
});

describe('avisos ao vivo', () => {
  it('somem quando o profissional corrige o dado', () => {
    let draft = proposalToDraft(proposal);
    const day = draft.days[0];
    const remada = day.exercises[1];
    expect(exerciseWarnings(remada)).toEqual([LIVE_WARNINGS.exerciseAmbiguous, LIVE_WARNINGS.restMissing]);

    draft = updateExercise(draft, day.key, remada.key, (ex) => selectExercise(ex, remadaB));
    draft = updateExercise(draft, day.key, remada.key, (ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, restSeconds: 60 })) }));
    const fixed = draft.days[0].exercises[1];
    expect(fixed.exercise).toEqual(remadaB);
    expect(fixed.match).toBe('manual');
    expect(exerciseWarnings(fixed)).toEqual([]);
  });

  it('dia sem nome e dia sem exercícios', () => {
    const draft = proposalToDraft(proposal);
    expect(dayWarnings({ ...draft.days[0], name: '  ', exercises: [] })).toEqual([
      LIVE_WARNINGS.dayNameBlank,
      LIVE_WARNINGS.dayWithoutExercises,
    ]);
  });

  it('série sem repetições, duração ou distância gera aviso', () => {
    const exercise = manualExercise(supino);
    const noReps = { ...exercise, sets: [{ ...setRepsMode(exercise.sets[0], 'none'), restSeconds: 60 }] };
    expect(exerciseWarnings(noReps)).toEqual([LIVE_WARNINGS.repsMissing]);
    expect(exerciseWarnings({ ...noReps, sets: [{ ...noReps.sets[0], durationSeconds: 30 }] })).toEqual([]);
  });
});

describe('setRepsMode', () => {
  it('trocar faixa por exata NÃO escolhe um número dentro da faixa', () => {
    const [range] = proposalToDraft(proposal).days[0].exercises[0].sets;
    expect(setRepsMode(range, 'exact')).toMatchObject({ repsMode: 'exact', reps: null, repsMin: null, repsMax: null });
  });
});

describe('draftProblems / draftToPayload', () => {
  it('exercício sem seleção do catálogo bloqueia a criação', () => {
    const problems = draftProblems(proposalToDraft(proposal));
    expect(problems).toEqual(['Dia 1 (SEGUNDA - PEITO), exercício 2 ("Remada curvada"): selecione um exercício do catálogo.']);
  });

  it('faixa incompleta ou invertida e exata vazia bloqueiam', () => {
    const draft = proposalToDraft(proposal);
    const day = draft.days[0];
    const broken = updateExercise(draft, day.key, day.exercises[0].key, (ex) => ({
      ...ex,
      sets: [
        { ...ex.sets[0], repsMax: null },
        { ...ex.sets[1], repsMin: 12, repsMax: 8 },
        { ...ex.sets[1], key: 'x', repsMode: 'exact', repsMin: null, repsMax: null, reps: null },
      ],
    }));
    const problems = draftProblems(broken).join('\n');
    expect(problems).toMatch(/série 1: informe mínimo e máximo/);
    expect(problems).toMatch(/série 2: o mínimo da faixa é maior/);
    expect(problems).toMatch(/série 3: informe as repetições/);
  });

  it('payload: faixa só em repsMin/repsMax, exata só em reps, na ordem revisada', () => {
    let draft = proposalToDraft(proposal);
    const day = draft.days[0];
    draft = updateExercise(draft, day.key, day.exercises[1].key, (ex) => selectExercise(ex, remadaA));
    draft = moveExercise(draft, day.key, day.exercises[1].key, -1);

    expect(draftProblems(draft)).toEqual([]);
    const payload = draftToPayload(draft);
    expect(payload.days[0].name).toBe('SEGUNDA - PEITO');
    expect(payload.days[0].exercises.map((e) => e.exerciseId)).toEqual(['ex-remada-a', 'ex-supino']);
    expect(payload.days[0].exercises[0]).toMatchObject({ notes: 'drop-set', sets: [expect.objectContaining({ reps: 12, repsMin: null, repsMax: null })] });
    expect(payload.days[0].exercises[1].sets[0]).toMatchObject({ reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 });
  });

  it('remover exercício e dia sem exercícios continuam válidos', () => {
    const draft = proposalToDraft(proposal);
    const day = draft.days[0];
    const onlySupino = removeExercise(draft, day.key, day.exercises[1].key);
    expect(draftProblems(onlySupino)).toEqual([]);
    expect(draftProblems({ ...onlySupino, days: [] })).toEqual(['Adicione pelo menos um dia.']);
  });
});
