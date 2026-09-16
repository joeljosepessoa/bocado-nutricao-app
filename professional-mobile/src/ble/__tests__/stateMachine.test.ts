import { initialScaleFlowState, scaleFlowReducer } from '../stateMachine';
import { MOCK_ADVERTISEMENT } from '../mockDriver';
import type { ScaleDriverDescriptor } from '../types';

const driver: ScaleDriverDescriptor = {
  id: 'mock-scale-v1',
  manufacturer: 'Bocado (simulação)',
  model: 'Balança de teste',
  protocolVersion: '1.0',
  capabilities: ['weightKg'],
};

describe('scaleFlowReducer — máquina de estados da tela de conexão', () => {
  it('começa em idle', () => {
    expect(initialScaleFlowState.status).toBe('idle');
  });

  it('START_SCAN -> scanning', () => {
    const state = scaleFlowReducer(initialScaleFlowState, { type: 'START_SCAN' });
    expect(state.status).toBe('scanning');
  });

  it('DEVICE_DISCOVERED -> connecting, guarda anúncio e driver', () => {
    const scanning = scaleFlowReducer(initialScaleFlowState, { type: 'START_SCAN' });
    const state = scaleFlowReducer(scanning, {
      type: 'DEVICE_DISCOVERED',
      advertisement: MOCK_ADVERTISEMENT,
      driver,
    });
    expect(state.status).toBe('connecting');
    expect(state.driver?.id).toBe('mock-scale-v1');
  });

  it('DEVICE_INCOMPATIBLE -> incompatible (nenhum driver reconheceu)', () => {
    const state = scaleFlowReducer(initialScaleFlowState, { type: 'DEVICE_INCOMPATIBLE' });
    expect(state.status).toBe('incompatible');
  });

  it('fluxo feliz completo: scan -> conectar -> aguardar -> revisar -> confirmar -> confirmado', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'START_SCAN' });
    state = scaleFlowReducer(state, { type: 'DEVICE_DISCOVERED', advertisement: MOCK_ADVERTISEMENT, driver });
    state = scaleFlowReducer(state, { type: 'CONNECTED' });
    expect(state.status).toBe('connected');

    state = scaleFlowReducer(state, { type: 'AWAITING_READING' });
    expect(state.status).toBe('awaitingReading');

    const rawPayload = {
      deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier,
      serviceUuid: 'svc',
      characteristicUuid: 'char',
      bytesBase64: 'AA==',
      capturedAt: new Date().toISOString(),
    };
    state = scaleFlowReducer(state, { type: 'READING_RECEIVED', rawPayload, normalized: { weightKg: 80 } });
    expect(state.status).toBe('reviewing');
    expect(state.normalized?.weightKg).toBe(80);

    state = scaleFlowReducer(state, { type: 'CONFIRM' });
    expect(state.status).toBe('syncing');

    state = scaleFlowReducer(state, { type: 'CONFIRM_SUCCEEDED', readingId: 'reading-1' });
    expect(state.status).toBe('confirmed');
    expect(state.confirmedReadingId).toBe('reading-1');
  });

  it('leitura inválida (validate falhou) -> error, sem chegar a reviewing', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'START_SCAN' });
    state = scaleFlowReducer(state, { type: 'DEVICE_DISCOVERED', advertisement: MOCK_ADVERTISEMENT, driver });
    state = scaleFlowReducer(state, { type: 'CONNECTED' });
    state = scaleFlowReducer(state, { type: 'AWAITING_READING' });
    state = scaleFlowReducer(state, { type: 'READING_INVALID', message: 'Peso fora de uma faixa plausível.' });
    expect(state.status).toBe('error');
    expect(state.errorMessage).toContain('faixa plausível');
  });

  it('DISCARD sempre volta para idle, mesmo a partir de reviewing', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'START_SCAN' });
    state = scaleFlowReducer(state, {
      type: 'READING_RECEIVED',
      rawPayload: {
        deviceIdentifier: 'x',
        serviceUuid: 'svc',
        characteristicUuid: 'char',
        bytesBase64: 'AA==',
        capturedAt: new Date().toISOString(),
      },
      normalized: { weightKg: 80 },
    });
    state = scaleFlowReducer(state, { type: 'DISCARD' });
    expect(state).toEqual(initialScaleFlowState);
  });

  it('sem rede: CONFIRM_QUEUED_OFFLINE não perde a leitura — fica em queuedOffline até sincronizar', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'CONFIRM' });
    state = scaleFlowReducer(state, { type: 'CONFIRM_QUEUED_OFFLINE' });
    expect(state.status).toBe('queuedOffline');

    state = scaleFlowReducer(state, { type: 'CONFIRM_SUCCEEDED', readingId: 'reading-2' });
    expect(state.status).toBe('confirmed');
  });

  it('DISCONNECTED depois de connected permite RECONNECT de volta a connecting', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'CONNECTED' });
    state = scaleFlowReducer(state, { type: 'DISCONNECTED' });
    expect(state.status).toBe('disconnected');

    state = scaleFlowReducer(state, { type: 'RECONNECT' });
    expect(state.status).toBe('connecting');
  });

  it('RESET volta ao estado inicial a partir de qualquer estado', () => {
    let state = scaleFlowReducer(initialScaleFlowState, { type: 'CONNECT_FAILED', message: 'falhou' });
    expect(state.status).toBe('error');
    state = scaleFlowReducer(state, { type: 'RESET' });
    expect(state).toEqual(initialScaleFlowState);
  });
});
