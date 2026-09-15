/**
 * Timer de descanso baseado em timestamp, não em contagem por tick.
 * O tempo restante é sempre recalculado a partir de `startedAt` (epoch ms)
 * e do relógio atual — nunca decrementado por um `setInterval` acumulando
 * erro. Isso garante que o timer continue correto mesmo se o app for para
 * segundo plano e voltar minutos depois (o SO pode suspender timers de JS,
 * mas não o relógio).
 */
export interface RestTimerState {
  totalSeconds: number;
  /** epoch ms de quando a contagem regressiva atual começou a rodar; null = pausado/parado */
  startedAt: number | null;
  /** segundos restantes congelados no momento da pausa; só relevante quando startedAt é null */
  remainingAtPause: number;
}

export function createTimer(totalSeconds: number): RestTimerState {
  return { totalSeconds, startedAt: null, remainingAtPause: totalSeconds };
}

export function startTimer(state: RestTimerState, now: number = Date.now()): RestTimerState {
  return { ...state, startedAt: now };
}

export function pauseTimer(state: RestTimerState, now: number = Date.now()): RestTimerState {
  if (state.startedAt == null) {
    return state;
  }
  return { ...state, startedAt: null, remainingAtPause: getRemainingSeconds(state, now) };
}

export function resetTimer(state: RestTimerState): RestTimerState {
  return createTimer(state.totalSeconds);
}

export function addSeconds(state: RestTimerState, delta: number, now: number = Date.now()): RestTimerState {
  if (state.startedAt == null) {
    const remaining = Math.max(0, state.remainingAtPause + delta);
    return { ...state, remainingAtPause: remaining };
  }
  const remaining = Math.max(0, getRemainingSeconds(state, now) + delta);
  return { ...state, startedAt: now, remainingAtPause: remaining, totalSeconds: state.totalSeconds };
}

export function getRemainingSeconds(state: RestTimerState, now: number = Date.now()): number {
  if (state.startedAt == null) {
    return Math.max(0, state.remainingAtPause);
  }
  const elapsedMs = now - state.startedAt;
  const remaining = state.remainingAtPause - Math.floor(elapsedMs / 1000);
  return Math.max(0, remaining);
}

export function isRunning(state: RestTimerState): boolean {
  return state.startedAt != null;
}

export function isFinished(state: RestTimerState, now: number = Date.now()): boolean {
  return getRemainingSeconds(state, now) <= 0;
}

export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
