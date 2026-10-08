import type { DietClientSummary } from '../../types/api';
import { DIET_SCREEN_TEXT, dietScreenReducer, initialDietScreenState, type DietScreenState } from '../dietScreenState';

const diet = { dietId: 'd', versionId: 'v', meals: [] } as DietClientSummary;
const run = (...events: Parameters<typeof dietScreenReducer>[1][]) => events.reduce<DietScreenState>(dietScreenReducer, initialDietScreenState);

describe('estados da tela "Minha dieta"', () => {
  it('carregando → conteúdo', () => {
    expect(initialDietScreenState).toEqual({ status: 'loading' });
    expect(run({ type: 'load' }, { type: 'loaded', diet })).toEqual({ status: 'content', diet, refreshing: false, refreshFailed: false });
  });

  it('erro de API/rede vira ERRO (com tentar novamente) — nunca "dieta não publicada"', () => {
    const state = run({ type: 'load' }, { type: 'failed' });
    expect(state).toEqual({ status: 'error', retrying: false });
    expect(dietScreenReducer(state, { type: 'load' })).toEqual({ status: 'error', retrying: true });
    expect(run({ type: 'load' }, { type: 'failed' }, { type: 'load' }, { type: 'loaded', diet })).toMatchObject({ status: 'content' });
  });

  it('sem dieta publicada (API respondeu null) é o estado VAZIO', () => {
    expect(run({ type: 'load' }, { type: 'loaded', diet: null })).toEqual({ status: 'empty', refreshing: false });
    expect(DIET_SCREEN_TEXT.empty).toBe('Sua dieta ainda não foi publicada.');
    expect(DIET_SCREEN_TEXT.error).toBe('Não foi possível carregar sua dieta.');
  });

  it('puxar para atualizar mantém a dieta na tela; se falhar, a dieta continua e aparece o aviso', () => {
    const loaded = run({ type: 'load' }, { type: 'loaded', diet });
    const refreshing = dietScreenReducer(loaded, { type: 'load' });
    expect(refreshing).toEqual({ status: 'content', diet, refreshing: true, refreshFailed: false });
    expect(dietScreenReducer(refreshing, { type: 'failed' })).toEqual({ status: 'content', diet, refreshing: false, refreshFailed: true });
    const newer = { ...diet, versionId: 'v2' };
    expect(dietScreenReducer(refreshing, { type: 'loaded', diet: newer })).toEqual({ status: 'content', diet: newer, refreshing: false, refreshFailed: false });
  });

  it('atualizar quando estava vazio: mostra o refresh e depois o conteúdo novo', () => {
    const empty = run({ type: 'load' }, { type: 'loaded', diet: null });
    expect(dietScreenReducer(empty, { type: 'load' })).toEqual({ status: 'empty', refreshing: true });
    expect(dietScreenReducer(dietScreenReducer(empty, { type: 'load' }), { type: 'loaded', diet })).toMatchObject({ status: 'content' });
  });
});
