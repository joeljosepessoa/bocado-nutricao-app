import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllEvaluationDrafts,
  evaluationDraftKey,
  isEvaluationDraftEmpty,
  loadEvaluationDraft,
  removeEvaluationDraft,
  saveEvaluationDraft,
  type EvaluationDraftData,
} from '../evaluationDraft';

function makeDraftInput(overrides: Partial<Omit<EvaluationDraftData, 'savedAt'>> = {}): Omit<EvaluationDraftData, 'savedAt'> {
  return {
    heightCm: '175',
    weightKg: '70',
    biologicalSex: 'male',
    protocolCode: 'jackson_pollock_7',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '',
    glucose: '',
    notes: '',
    draftInstructions: '',
    measurements: {},
    skinfolds: {},
    bioimpedance: {},
    ...overrides,
  };
}

describe('evaluationDraftKey', () => {
  it('isola por clientId', () => {
    expect(evaluationDraftKey('client-a')).not.toBe(evaluationDraftKey('client-b'));
  });

  it('isola por evaluationId', () => {
    expect(evaluationDraftKey('client-a', 'eval-1')).not.toBe(evaluationDraftKey('client-a', 'eval-2'));
  });

  it('usa "new" quando não há evaluationId (avaliação nova)', () => {
    expect(evaluationDraftKey('client-a')).toBe('bocado:eval-draft:client-a:new');
  });
});

describe('isEvaluationDraftEmpty', () => {
  it('true quando todos os campos relevantes estão vazios', () => {
    expect(isEvaluationDraftEmpty(makeDraftInput({ heightCm: '', weightKg: '' }))).toBe(true);
  });

  it('false quando algum campo escalar foi preenchido', () => {
    expect(isEvaluationDraftEmpty(makeDraftInput({ heightCm: '' , weightKg: '', notes: 'algo' }))).toBe(false);
  });

  it('false quando algum grupo de medidas foi preenchido', () => {
    expect(
      isEvaluationDraftEmpty(makeDraftInput({ heightCm: '', weightKg: '', measurements: { waistCm: '80' } })),
    ).toBe(false);
  });
});

describe('saveEvaluationDraft / loadEvaluationDraft', () => {
  const key = evaluationDraftKey('client-1', 'eval-1');

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('salva e recupera o rascunho completo (roundtrip)', () => {
    const input = makeDraftInput({ notes: 'observação clínica' });
    saveEvaluationDraft(key, input);

    const loaded = loadEvaluationDraft(key);
    expect(loaded).not.toBeNull();
    expect(loaded?.notes).toBe('observação clínica');
    expect(loaded?.heightCm).toBe('175');
    expect(typeof loaded?.savedAt).toBe('string');
  });

  it('não persiste um rascunho vazio', () => {
    saveEvaluationDraft(key, makeDraftInput({ heightCm: '', weightKg: '' }));
    expect(loadEvaluationDraft(key)).toBeNull();
  });

  it('remove o rascunho quando o formulário volta a ficar vazio', () => {
    saveEvaluationDraft(key, makeDraftInput());
    expect(loadEvaluationDraft(key)).not.toBeNull();

    saveEvaluationDraft(key, makeDraftInput({ heightCm: '', weightKg: '' }));
    expect(loadEvaluationDraft(key)).toBeNull();
  });

  it('retorna null e limpa a chave quando o JSON salvo está corrompido', () => {
    sessionStorage.setItem(key, '{ isso não é json válido');
    expect(loadEvaluationDraft(key)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('retorna null quando não há rascunho salvo', () => {
    expect(loadEvaluationDraft(key)).toBeNull();
  });

  it('isola rascunhos por clientId — um cliente nunca vê o rascunho de outro', () => {
    const keyA = evaluationDraftKey('client-a', 'eval-1');
    const keyB = evaluationDraftKey('client-b', 'eval-1');
    saveEvaluationDraft(keyA, makeDraftInput({ notes: 'do cliente A' }));

    expect(loadEvaluationDraft(keyB)).toBeNull();
    expect(loadEvaluationDraft(keyA)?.notes).toBe('do cliente A');
  });

  it('isola rascunhos por evaluationId do mesmo cliente', () => {
    const keyNew = evaluationDraftKey('client-a');
    const keyEdit = evaluationDraftKey('client-a', 'eval-1');
    saveEvaluationDraft(keyNew, makeDraftInput({ notes: 'nova avaliação' }));
    saveEvaluationDraft(keyEdit, makeDraftInput({ notes: 'editando avaliação existente' }));

    expect(loadEvaluationDraft(keyNew)?.notes).toBe('nova avaliação');
    expect(loadEvaluationDraft(keyEdit)?.notes).toBe('editando avaliação existente');
  });

  it('não lança quando sessionStorage está indisponível (ex.: modo privado)', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('indisponível');
        },
        setItem: () => {
          throw new Error('indisponível');
        },
        removeItem: () => {
          throw new Error('indisponível');
        },
        get length() {
          throw new Error('indisponível');
        },
        key: () => {
          throw new Error('indisponível');
        },
      },
    });

    try {
      expect(() => saveEvaluationDraft(key, makeDraftInput())).not.toThrow();
      expect(() => loadEvaluationDraft(key)).not.toThrow();
      expect(loadEvaluationDraft(key)).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
    }
  });
});

describe('removeEvaluationDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('remove apenas a chave indicada, sem lançar se ela não existir', () => {
    const key = evaluationDraftKey('client-1');
    expect(() => removeEvaluationDraft(key)).not.toThrow();

    saveEvaluationDraft(key, makeDraftInput());
    removeEvaluationDraft(key);
    expect(loadEvaluationDraft(key)).toBeNull();
  });
});

describe('clearAllEvaluationDrafts', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('remove todos os rascunhos de avaliação, mas preserva outras chaves da aplicação', () => {
    saveEvaluationDraft(evaluationDraftKey('client-a'), makeDraftInput());
    saveEvaluationDraft(evaluationDraftKey('client-b', 'eval-9'), makeDraftInput());
    sessionStorage.setItem('outra-chave-nao-relacionada', 'preservar');

    clearAllEvaluationDrafts();

    expect(loadEvaluationDraft(evaluationDraftKey('client-a'))).toBeNull();
    expect(loadEvaluationDraft(evaluationDraftKey('client-b', 'eval-9'))).toBeNull();
    expect(sessionStorage.getItem('outra-chave-nao-relacionada')).toBe('preservar');
  });
});
