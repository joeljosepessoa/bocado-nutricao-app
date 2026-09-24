import { AiOutputValidationError } from '../../ai-errors';
import { parseOrganizedWorkout } from './organized-workout.schema';

const setGroup = (overrides: Record<string, unknown> = {}) => ({
  count: 4,
  reps: null,
  repsMin: 6,
  repsMax: 10,
  restSeconds: 90,
  loadValue: null,
  loadUnit: null,
  durationSeconds: null,
  distanceMeters: null,
  tempo: null,
  notes: null,
  ...overrides,
});

const payload = (setOverrides: Record<string, unknown> = {}, exerciseOverrides: Record<string, unknown> = {}) => ({
  days: [
    {
      name: 'SEGUNDA - PEITO + TRÍCEPS',
      notes: null,
      exercises: [
        { name: 'Supino reto com barra', muscleGroup: 'Peito', notes: null, setGroups: [setGroup(setOverrides)], warnings: [], ...exerciseOverrides },
      ],
    },
  ],
  warnings: [],
});

const expectInvalid = (text: string, fragment: string | RegExp) => {
  let error: unknown;
  try {
    parseOrganizedWorkout(text);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(AiOutputValidationError);
  expect((error as Error).message).toMatch(fragment);
};

describe('parseOrganizedWorkout', () => {
  it('aceita JSON válido e preserva a faixa de repetições como veio', () => {
    const result = parseOrganizedWorkout(JSON.stringify(payload()));
    expect(result.days[0].exercises[0].setGroups[0]).toMatchObject({ count: 4, reps: null, repsMin: 6, repsMax: 10, restSeconds: 90 });
  });

  it('tolera cerca de markdown e texto em volta do JSON (só formatação)', () => {
    const fenced = '```json\n' + JSON.stringify(payload()) + '\n```';
    expect(parseOrganizedWorkout(fenced).days).toHaveLength(1);
    expect(parseOrganizedWorkout('Aqui está: ' + JSON.stringify(payload()) + ' fim').days).toHaveLength(1);
  });

  it('campo ausente conta como não informado (null), não como erro', () => {
    const minimal = { days: [{ exercises: [{ name: 'Remada', setGroups: [{ count: 3 }] }] }] };
    const result = parseOrganizedWorkout(JSON.stringify(minimal));
    expect(result.days[0].name).toBeNull();
    expect(result.days[0].exercises[0].setGroups[0]).toMatchObject({ count: 3, reps: null, restSeconds: null });
    expect(result.warnings).toEqual([]);
  });

  it('rejeita texto que não é JSON', () => {
    expectInvalid('Não consegui organizar o treino.', /não é JSON/);
  });

  it('rejeita campo desconhecido', () => {
    expectInvalid(JSON.stringify(payload({ rir: 2 })), /repsMin|rir: campo desconhecido/);
    expectInvalid(JSON.stringify({ ...payload(), extra: true }), /extra: campo desconhecido/);
  });

  it('rejeita tipos errados e valores fora dos limites', () => {
    expectInvalid(JSON.stringify(payload({ restSeconds: '90s' })), /restSeconds/);
    expectInvalid(JSON.stringify(payload({ repsMin: 6.5 })), /repsMin/);
    expectInvalid(JSON.stringify(payload({ restSeconds: 99999 })), /restSeconds/);
    expectInvalid(JSON.stringify(payload({ loadUnit: 'arroba' })), /loadUnit/);
    expectInvalid(JSON.stringify({ days: 'segunda' }), /days: deve ser uma lista/);
  });

  it('rejeita reps exata junto com faixa, e faixa incompleta', () => {
    expectInvalid(JSON.stringify(payload({ reps: 8 })), /nunca os dois/);
    expectInvalid(JSON.stringify(payload({ repsMax: null })), /mínimo e máximo/);
    expectInvalid(JSON.stringify(payload({ repsMin: 12, repsMax: 8 })), /maior que o máximo/);
  });

  it('exige nome do exercício e count de cada grupo de séries', () => {
    expectInvalid(JSON.stringify(payload({}, { name: '   ' })), /name: obrigatório/);
    expectInvalid(JSON.stringify(payload({ count: undefined })), /count: obrigatório/);
    expectInvalid(JSON.stringify(payload({ count: 0 })), /count/);
  });

  it('limita o total de séries por exercício', () => {
    const tooMany = payload({}, { setGroups: [setGroup({ count: 20 }), setGroup({ count: 20 })] });
    expectInvalid(JSON.stringify(tooMany), /no máximo 30 séries/);
  });
});
