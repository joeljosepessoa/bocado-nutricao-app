import type { BleAdvertisement, NormalizedScaleReading, RawScalePayload, ScaleDriverDescriptor } from './types';

/**
 * Máquina de estados da tela "Conectar balança" (Fase 10, §06/§07 do
 * desenho). Nenhuma transição chega a `confirmed` sem passar por `CONFIRM`
 * — nada toca o backend antes disso; ver ScaleConnectScreen.
 */
export type ScaleFlowStatus =
  | 'idle'
  | 'scanning'
  | 'incompatible'
  | 'connecting'
  | 'connected'
  | 'awaitingReading'
  | 'reviewing'
  | 'syncing'
  | 'queuedOffline'
  | 'confirmed'
  | 'discarded'
  | 'disconnected'
  | 'error';

export interface ScaleFlowState {
  status: ScaleFlowStatus;
  advertisement?: BleAdvertisement;
  driver?: ScaleDriverDescriptor;
  rawPayload?: RawScalePayload;
  normalized?: NormalizedScaleReading;
  errorMessage?: string;
  confirmedReadingId?: string;
}

export type ScaleFlowEvent =
  | { type: 'START_SCAN' }
  | { type: 'DEVICE_DISCOVERED'; advertisement: BleAdvertisement; driver: ScaleDriverDescriptor }
  | { type: 'DEVICE_INCOMPATIBLE' }
  | { type: 'CONNECTED' }
  | { type: 'CONNECT_FAILED'; message: string }
  | { type: 'AWAITING_READING' }
  | { type: 'READING_RECEIVED'; rawPayload: RawScalePayload; normalized: NormalizedScaleReading }
  | { type: 'READING_INVALID'; message: string }
  | { type: 'CONFIRM' }
  | { type: 'CONFIRM_QUEUED_OFFLINE' }
  | { type: 'CONFIRM_SUCCEEDED'; readingId: string }
  | { type: 'CONFIRM_FAILED'; message: string }
  | { type: 'DISCARD' }
  | { type: 'DISCONNECTED' }
  | { type: 'RECONNECT' }
  | { type: 'RESET' };

export const initialScaleFlowState: ScaleFlowState = { status: 'idle' };

export function scaleFlowReducer(state: ScaleFlowState, event: ScaleFlowEvent): ScaleFlowState {
  switch (event.type) {
    case 'START_SCAN':
      return { status: 'scanning' };

    case 'DEVICE_DISCOVERED':
      return { status: 'connecting', advertisement: event.advertisement, driver: event.driver };

    case 'DEVICE_INCOMPATIBLE':
      return { status: 'incompatible' };

    case 'CONNECTED':
      return { ...state, status: 'connected' };

    case 'CONNECT_FAILED':
      return { ...state, status: 'error', errorMessage: event.message };

    case 'AWAITING_READING':
      return { ...state, status: 'awaitingReading' };

    case 'READING_RECEIVED':
      return { ...state, status: 'reviewing', rawPayload: event.rawPayload, normalized: event.normalized };

    case 'READING_INVALID':
      return { ...state, status: 'error', errorMessage: event.message };

    case 'CONFIRM':
      return { ...state, status: 'syncing' };

    case 'CONFIRM_QUEUED_OFFLINE':
      return { ...state, status: 'queuedOffline' };

    case 'CONFIRM_SUCCEEDED':
      return { ...state, status: 'confirmed', confirmedReadingId: event.readingId };

    case 'CONFIRM_FAILED':
      return { ...state, status: 'error', errorMessage: event.message };

    case 'DISCARD':
      return { status: 'idle' };

    case 'DISCONNECTED':
      return { ...state, status: 'disconnected' };

    case 'RECONNECT':
      return { ...state, status: 'connecting', errorMessage: undefined };

    case 'RESET':
      return initialScaleFlowState;

    default:
      return state;
  }
}
