import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  addSeconds,
  createTimer,
  formatSeconds,
  getRemainingSeconds,
  isFinished,
  isRunning,
  pauseTimer,
  resetTimer,
  startTimer,
  type RestTimerState,
} from '../timer/restTimer';
import { cancelRestTimerNotification, scheduleRestTimerNotification } from '../notifications/restTimerNotification';

export interface RestTimerControls {
  remainingSeconds: number;
  label: string;
  running: boolean;
  finished: boolean;
  start: (seconds?: number) => void;
  pause: () => void;
  reset: (seconds?: number) => void;
  adjust: (deltaSeconds: number) => void;
}

export function useRestTimer(defaultSeconds: number): RestTimerControls {
  const [state, setState] = useState<RestTimerState>(() => createTimer(defaultSeconds));
  const [, forceTick] = useState(0);
  const notificationIdRef = useRef<string | null>(null);

  // O valor exibido é sempre recalculado a partir do relógio (ver
  // src/timer/restTimer.ts); este efeito só força um novo render a cada
  // segundo enquanto o timer roda — não é a fonte da contagem.
  useEffect(() => {
    if (!isRunning(state)) {
      return;
    }
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        forceTick((n) => n + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      cancelRestTimerNotification(notificationIdRef.current);
    },
    [],
  );

  const start = useCallback((seconds?: number) => {
    setState((prev) => {
      const base = seconds != null ? createTimer(seconds) : prev;
      const next = startTimer(base, Date.now());
      scheduleRestTimerNotification(getRemainingSeconds(next)).then((id) => {
        notificationIdRef.current = id;
      });
      return next;
    });
  }, []);

  const pause = useCallback(() => {
    setState((prev) => pauseTimer(prev, Date.now()));
    cancelRestTimerNotification(notificationIdRef.current);
    notificationIdRef.current = null;
  }, []);

  const reset = useCallback((seconds?: number) => {
    cancelRestTimerNotification(notificationIdRef.current);
    notificationIdRef.current = null;
    setState((prev) => (seconds != null ? createTimer(seconds) : resetTimer(prev)));
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setState((prev) => addSeconds(prev, deltaSeconds, Date.now()));
  }, []);

  const now = Date.now();
  const remainingSeconds = getRemainingSeconds(state, now);

  return {
    remainingSeconds,
    label: formatSeconds(remainingSeconds),
    running: isRunning(state),
    finished: isFinished(state, now),
    start,
    pause,
    reset,
    adjust,
  };
}
