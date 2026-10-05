import { describe, expect, it } from 'vitest';
import { formToSetInput, parseReps, setToForm } from '../setFields';

describe('campos da série no editor', () => {
  it('repetições: exata, faixa (hífen, travessão ou "a") e vazio — nunca mistura as formas', () => {
    expect(parseReps('12')).toEqual({ reps: 12, repsMin: null, repsMax: null });
    expect(parseReps('8-12')).toEqual({ reps: null, repsMin: 8, repsMax: 12 });
    expect(parseReps('8–12')).toEqual({ reps: null, repsMin: 8, repsMax: 12 });
    expect(parseReps('8 a 12')).toEqual({ reps: null, repsMin: 8, repsMax: 12 });
    expect(parseReps(' ')).toEqual({ reps: null, repsMin: null, repsMax: null });
    expect(parseReps('12-8')).toEqual({ error: expect.stringMatching(/mínimo/) });
    expect(parseReps('doze')).toEqual({ error: expect.stringMatching(/Repetições/) });
  });

  it('ida e volta entre a série da API e o formulário', () => {
    expect(setToForm({ reps: null, repsMin: 6, repsMax: 10, loadValue: 22.5, restSeconds: 90 })).toEqual({ reps: '6-10', load: '22,5', rest: '90' });
    expect(formToSetInput({ reps: '6-10', load: '22,5', rest: '90' }, null)).toEqual({
      reps: null,
      repsMin: 6,
      repsMax: 10,
      loadValue: 22.5,
      loadUnit: 'kg',
      restSeconds: 90,
    });
  });

  it('carga vazia limpa a carga; unidade existente é preservada; valores inválidos viram mensagem', () => {
    expect(formToSetInput({ reps: '12', load: '', rest: '' }, null)).toMatchObject({ loadValue: null, loadUnit: null, restSeconds: null });
    expect(formToSetInput({ reps: '12', load: '20', rest: '60' }, 'lb')).toMatchObject({ loadValue: 20, loadUnit: 'lb' });
    expect(formToSetInput({ reps: '12', load: 'x', rest: '60' }, null)).toEqual({ error: expect.stringMatching(/Carga/) });
    expect(formToSetInput({ reps: '12', load: '', rest: '1,5' }, null)).toEqual({ error: expect.stringMatching(/Descanso/) });
  });
});
